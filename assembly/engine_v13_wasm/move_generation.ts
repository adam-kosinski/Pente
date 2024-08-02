import { Game, SearchResult, LinearShape, TTEntry } from "./model";


// store which shapes should be looked at first, to use when ordering moves
// earlier in this array (= lower number in map) is more important
// converting to a map for faster lookup
const shapePriority = [
  "pente-threat-22",
  "pente-threat-4",
  "pente-threat-31",
  "open-tria",
  "stretch-tria",
  "extendable-stretch-tria-threatened",
  "extendable-tria",
  "extendable-stretch-tria",
  "capture-threat",
  "stretch-two",
  "open-pair",
  "open-tessera",  // nothing you can do except maybe a capture, which would mean looking at capture-threat shapes first
  "pente" // nothing you can do
]
const shapePriorityMap: Map<string, i32> = new Map()
for (let i = 0; i < shapePriority.length; i++) {
  shapePriorityMap.set(shapePriority[i], i)
}


function isValidMove(game: Game, move: i32[]): boolean {
  return game.board[move[0]][move[1]] === -1
}

function moveHash(move: i32[]): string {
  return move[0].toString() + "," + move[1].toString()
}


export function generateOrderedMoves(
  game: Game,
  principalVariationMove: i32[],  // pass [] to ignore
  tableEntry: TTEntry | null,  // pass null to ignore
  killerMoves: i32[][],  // pass [] to ignore
  prevDepthResults: SearchResult[]  // pass [] to ignore
): i32[][] {

  // if we have it, use order from prevDepthResults - this will contain all moves, ranked
  // they are guaranteed to be valid because we used them for the last depth analysis
  // the principal variation move will come first by default
  if (prevDepthResults.length > 0) {
    return prevDepthResults.map((r: SearchResult) => r.bestVariation[0])
  }
  // if we don't have such a nice list, use heuristics

  const moves: i32[][] = []
  const moveHashes: Set<string> = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"

  // first move must be in center
  if (game.nMoves === 0) {
    const center = i32(Math.floor(game.board.length / 2))
    return[[center, center]]
  }

  // first priority is principal variation move
  if (principalVariationMove.length > 0 && isValidMove(game, principalVariationMove)) {
    moves.push(principalVariationMove)
    moveHashes.add(moveHash(principalVariationMove))
  }
  // second priority is transposition table entry (aka hash move)
  if (tableEntry !== null && tableEntry.result.bestVariation.length > 0) {
    const goodMove = tableEntry.result.bestVariation[0]
    if (isValidMove(game, goodMove)) {
      const hash = moveHash(goodMove)
      if (!moveHashes.has(hash)) {
        moves.push(goodMove)
        moveHashes.add(hash)
      }
    }
  }
  // third priority are killer moves
  if (killerMoves.length > 0) {
    for (let i=0; i<killerMoves.length; i++) {
      const move = killerMoves[i]
      if (!isValidMove(game, move)) continue
      const hash = moveHash(move)
      if (!moveHashes.has(hash)) {
        moves.push(move)
        moveHashes.add(hash)
      }
    }
  }

  // TODO - if there is a pente threat, the only relevant move for the owner is completing it, and the only relevant moves for the opponent are within it or captures or completing their own pente

  // if move is part of an existing shape, it is probably interesting
  // also, if it is part of a forcing shape it is probably more interesting, so visit those first
  // sort linear shapes first and then iterate over spots - it's okay that this is sorting in place, helps to keep the game object ordered (and might help speed up further sorts)
  game.linearShapes.sort((a: LinearShape, b: LinearShape) => {
    if (shapePriorityMap.has(a.type) && shapePriorityMap.has(b.type)) return shapePriorityMap.get(a.type) - shapePriorityMap.get(b.type)
    return 0
  })
  // however, we need another reference to the sorted version (probably?), because linear shapes get added and removed from the game as we traverse the search tree, so the sorting gets messed up
  const sortedShapes = game.linearShapes.slice()

  for (let i=0; i<sortedShapes.length; i++) {
    const shape = sortedShapes[i]
    const dy = i32(Math.sign(shape.end[0] - shape.begin[0]))
    const dx = i32(Math.sign(shape.end[1] - shape.begin[1]))
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      if (!isValidMove(game, [r, c])) continue
      const hash = moveHash([r,c])
      if (!moveHashes.has(hash)) {
        moves.push([r,c])
        moveHashes.add(hash)
      }
    }
  }

  // return all other spots near gems
  for (let r = 0; r < game.board.length; r++) {
    for (let c = 0; c < game.board.length; c++) {
      if (game.board[r][c] === -1) continue
      // there is a gem here, suggest nearby locations
      const dists = [0, -1, 1, -2, 2]
      for (let i=0; i<dists.length; i++) {
        for (let j=0; j<dists.length; j++) {
          const dx = dists[i]
          const dy = dists[j]
          if (r + dy >= 0 && r + dy < game.board.length && c + dx >= 0 && c + dx < game.board.length) {
            const move = [r + dy, c + dx]
            if (!isValidMove(game, move)) continue
            const hash = moveHash(move)
            if (!moveHashes.has(hash)) {
              moves.push(move)
              moveHashes.add(hash)
            }
          }
        }
      }
    }
  }

  return moves
}


/*

export function getNonQuietMoves(game: Game): number[][] {
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
    else if (["extendable-tria", "extendable-stretch-tria", "extendable-stretch-tria-threatened"].includes(shape.type) && shape.owner === game.currentPlayer) {
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

*/