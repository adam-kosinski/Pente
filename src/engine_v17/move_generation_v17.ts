import { makeMove, undoMove, type GameState, type SearchResult, type EvalFlag, type LinearShape } from "./model_v17";
import { type TTEntry, transpositionTable, transpositionTableSet, TTableKey } from "./ttable_v17";



// store which shapes should be looked at first, to use when ordering moves
// lower number is more important
// using an object instead of an array for faster lookup
const shapePriority: Record<string, number> = {
  "pente-threat-22": 2,
  "pente-threat-4": 3,
  "pente-threat-31": 4,
  "open-tria": 5,
  "stretch-tria": 6,
  "extendable-stretch-tria-2": 7,
  "extendable-stretch-tria-1": 8,
  "extendable-tria": 9,
  "extendable-stretch-tria": 10,
  "capture-threat": 11,
  "stretch-two": 12,
  "open-pair": 13,
  "open-tessera": 20,  // nothing you can do except maybe a capture, which would mean looking at capture-threat shapes first
  "pente": 30  // nothing you can do
}


export function* makeOrderedMoveIterator(
  game: GameState,
  ply: number,
  principalVariationMove: number[] | undefined = undefined,
  tableEntry: TTEntry | undefined = undefined,
  killerMoves: number[][][] = [],
  prevDepthResults: SearchResult[] = []
) {
  // because good moves often cause a cutoff, don't generate more less-good moves unless needed
  // so, create an iterator that generates moves as needed (using generator syntax for readability)
  // first move must be in center
  if (game.nMoves === 0) {
    const center = Math.floor(game.board.length / 2)
    yield [center, center]
    return
  }

  // setup
  const moveHashes = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const isValidMove = function (move: number[]) {
    return game.board[move[0]][move[1]] === undefined
  }

  // use order from prevDepthResults - this will contain all remaining moves, ranked
  // the principal variation move will come first by default
  if (prevDepthResults.length > 0) {
    for (const result of prevDepthResults) {
      const move = result.bestVariation[0]
      if (!isValidMove(move)) continue
      const hash = move[0] + "," + move[1]
      if (!moveHashes.has(hash)) {
        yield move
        moveHashes.add(hash)
      }
    }
    return
  }
  // if we don't have such a nice list, use heuristics

  // first priority is principal variation move
  if (principalVariationMove !== undefined && isValidMove(principalVariationMove)) {
    yield principalVariationMove
    moveHashes.add(principalVariationMove.join(","))
  }
  // second priority is transposition table entry (aka hash move)
  if (tableEntry !== undefined) {
    const goodMove = tableEntry.result.bestVariation[0]
    if (goodMove !== undefined && isValidMove(goodMove)) {
      const hash = goodMove[0] + "," + goodMove[1]
      if (!moveHashes.has(hash)) {
        yield goodMove
        moveHashes.add(hash)
      }
    }
  }
  // third priority are killer moves
  if (killerMoves[ply]) {
    for (const move of killerMoves[ply]) {
      if (!isValidMove(move)) continue
      const hash = move[0] + "," + move[1]
      if (!moveHashes.has(hash)) {
        yield move
        moveHashes.add(hash)
      }
    }
  }

  // TODO - if there is a pente threat, the only relevant move for the owner is completing it, and the only relevant moves for the opponent are within it or captures or completing their own pente

  // if move is part of an existing shape, it is probably interesting
  // also, if it is part of a forcing shape it is probably more interesting, so visit those first
  // sort linear shapes first and then iterate over spots - it's okay that this is sorting in place, helps to keep the game object ordered (and might help speed up further sorts)
  game.linearShapes.sort((a, b) => {
    if (a.type in shapePriority && b.type in shapePriority) return shapePriority[a.type] - shapePriority[b.type]
    return 0
  })
  // however, we need another reference to the sorted version (probably?), because linear shapes get added and removed from the game as we traverse the search tree, so the sorting gets messed up
  const sortedShapes = game.linearShapes.slice()

  for (const shape of sortedShapes) {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      if (!isValidMove([r, c])) continue
      const hash = r + "," + c
      if (!moveHashes.has(hash)) {
        yield [r, c]
        moveHashes.add(hash)
      }
    }
  }

  // return all other spots near gems
  for (let r = 0; r < game.board.length; r++) {
    for (let c = 0; c < game.board.length; c++) {
      if (game.board[r][c] === undefined) continue
      // there is a gem here, suggest nearby locations
      const dists = [0, -1, 1, -2, 2]
      for (const dy of dists) {
        for (const dx of dists) {
          // filter symmetric moves in the opening
          // TODO extend this past move 1 using symmetry checking
          if (game.nMoves === 1) {
            if (dy <= 0 || dx < 0 || dx > dy) continue
          }

          if (r + dy >= 0 && r + dy < game.board.length && c + dx >= 0 && c + dx < game.board.length) {
            const move = [r + dy, c + dx]
            if (!isValidMove(move)) continue
            const hash = move[0] + "," + move[1]
            if (!moveHashes.has(hash)) {
              yield move
              moveHashes.add(hash)
            }
          }
        }
      }
    }
  }
}



export function getNonQuietMoves(game: GameState): number[][] {
  // function to tell if a position is quiet, used for quiescence search (QS), and which moves relevant to the non-quietness should be considered for the QS
  // if the return move list has length 0, the position is quiet

  // suppose it is my turn
  // in order of urgency:
  // if I have a pente threat, just complete pente
  // if the opponent has a pente threat or open tessera, needs to be blocked - not quiet (if I have one the eval function will notice that as a win)
  // else, examine these in order:
  //  - if I have an open or extendable tria, we want to see what happens if I extend it to a open or closed tessera - not quiet
  //  - if the opponent has a open (not just extendable) tria, we need to block it

  // if there are pairs I can capture, that often can result in tactics - not quiet
  //  - should always examine this, possibility for blocking any of the above situations, and to find out if I can force a 5-capture win via tactics
  //  - but rank capture moves behind the more forcing moves above
  // if there are pairs my opponent can capture, it's not immediately tactical, so we can probably just do the static eval

  const myPenteThreats: LinearShape[] = []
  const opponentPenteThreats: LinearShape[] = []
  const myOpenTrias: LinearShape[] = []
  const myExtendableTrias: LinearShape[] = []
  const opponentOpenTrias: LinearShape[] = []
  const myCaptureThreats: LinearShape[] = []

  for (const shape of game.linearShapes) {
    if (shape.type.includes("pente-threat")) {
      if (shape.owner === game.currentPlayer) {
        myPenteThreats.push(shape)
        break  // no need to keep looking, just play this move and win
      }
      else opponentPenteThreats.push(shape)
    }
    else if (["open-tria", "stretch-tria"].includes(shape.type)) {
      if (shape.owner === game.currentPlayer) myOpenTrias.push(shape)
      else opponentOpenTrias.push(shape)
    }
    else if (["extendable-tria", "extendable-stretch-tria-1", "extendable-stretch-tria-2"].includes(shape.type) && shape.owner === game.currentPlayer) {
      myExtendableTrias.push(shape)
    }
    else if (shape.type === "capture-threat" && shape.owner === game.currentPlayer) {
      myCaptureThreats.push(shape)
    }
  }

  let nonQuietShapes: LinearShape[] = []
  if (myPenteThreats.length > 0) nonQuietShapes = myPenteThreats
  else if (opponentPenteThreats.length > 0) nonQuietShapes = [...opponentPenteThreats, ...myCaptureThreats]
  else nonQuietShapes = [...myOpenTrias, ...myExtendableTrias, ...opponentOpenTrias, ...myCaptureThreats]

  // get moves from shapes - similar logic to the main move generator
  const moves = []

  // setup
  const moveHashes = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const isValidMove = function (move: number[]) {
    return game.board[move[0]][move[1]] === undefined
  }
  for (const shape of nonQuietShapes) {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      if (!isValidMove([r, c])) continue
      const hash = r + "," + c
      if (!moveHashes.has(hash)) {
        moves.push([r, c])
        moveHashes.add(hash)
      }
    }
  }
  return moves
}