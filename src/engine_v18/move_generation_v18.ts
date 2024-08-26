import { getCapturesBlockingAll } from "./evaluation_v18";
import { isRestricted, type GameState, type SearchResult, type LinearShape } from "./model_v18";
import { type TTEntry } from "./ttable_v18";



// store which shapes should be looked at first, to use when ordering moves
// earlier is more important
const shapePriorityDef = [
  "pente-threat-4",
  "pente-threat-31",
  "pente-threat-22",
  // stuff that can create a double pente threat
  "open-tria",
  "stretch-tria",
  // stuff that can create a pente threat
  "extendable-stretch-tria-2",  // contains vulnerable pair
  "pente-potential-2",  // contains vulnerable pair
  "extendable-stretch-tria-1",
  "pente-potential-1",
  "extendable-tria",
  // captures matter but aren't forcing
  "capture-threat",
  // favor keeping gems in line with existing ones
  "stretch-two",
  "open-pair",
  "three-gap"
]
// if shape isn't owned by me or is in this list, is considered non-forcing
const nonForcingShapes = [
  "stretch-two",
  "open-pair",
  "three-gap"
]
// convert to an object instead of an array for faster lookup
const shapePriority: Record<string, number> = Object.fromEntries(shapePriorityDef.map((name, idx) => [name, idx]))


export function* makeOrderedMoveIterator(
  game: GameState,
  forcingOnly = false,  // useful for static evaluation
  ply: number = 1,  // only used if have killer moves
  principalVariationMove: number[] | undefined = undefined,
  tableEntry: TTEntry | undefined = undefined,
  killerMoves: number[][][] = [],
  prevDepthResults: SearchResult[] = [],
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
    if(isRestricted(game, move[0], move[1])) return false
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

  // if move is part of an existing shape, it is probably interesting
  // also, if it is part of a forcing shape it is probably more interesting, so visit those first
  // sort linear shapes first and then iterate over spots - it's okay that this is sorting in place, helps to keep the game object ordered (and might help speed up further sorts)
  game.linearShapes.sort((a, b) => {
    if (a.type in shapePriority && b.type in shapePriority) return shapePriority[a.type] - shapePriority[b.type]
    else if (a.type in shapePriority) return -1
    else if (b.type in shapePriority) return 1
    return 0
  })
  // however, we need another reference to the sorted version (probably?), because linear shapes get added and removed from the game as we traverse the search tree, so the sorting gets messed up
  let sortedShapes = game.linearShapes.slice()

  let includeNonShapeMoves = true  // flag

  // if I have a pente threat, the only relevant move is winning
  const myPenteThreat = sortedShapes.find(shape => shape.owner === game.currentPlayer && shape.type.includes("pente-threat"))
  if (myPenteThreat) {
    sortedShapes = [myPenteThreat]
    includeNonShapeMoves = false
  }

  // else if I have 4 captures and a capture threat, only relevant move is winning
  if (game.captures[game.currentPlayer] === 4) {
    const captureThreat = sortedShapes.find(shape => shape.owner === game.currentPlayer && shape.type === "capture-threat")
    if (captureThreat) {
      sortedShapes = [captureThreat]
      includeNonShapeMoves = false
    }
  }

  // else if there is an opponent pente threat, the only relevant moves are within it or making a capture that blocks all opponent pente threats
  const opponentPenteThreats = sortedShapes.filter(shape => shape.owner !== game.currentPlayer && shape.type.includes("pente-threat"))
  if (opponentPenteThreats.length > 0) {
    const blockingCaptures = getCapturesBlockingAll(game, opponentPenteThreats)
    sortedShapes = opponentPenteThreats.concat(blockingCaptures)
    includeNonShapeMoves = false
  }

  if (forcingOnly) {
    sortedShapes = sortedShapes.filter(shape => nonForcingShapes.includes(shape.type))
    includeNonShapeMoves = false
  }

  // thoughts:
  // if there is a tria that you own, you can do anything
  // if there is a tria the opponent owns, you need to block it eventually
  // don't want to let it become an open tessera that can't be blocked
  // one way is to block the tria now
  // if you don't, then when it forms a tessera, you better be able to capture across the tessera (this might be capturing the newest stone, not in the tria)
  // this means that tria + your move + tessera stone, needs to contain a capture threat owned by you
  // if this threat exists already, you're good
  // if not, how does that constrain you?

  // find moves in shapes
  for (const shape of sortedShapes) {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      if (forcingOnly && shape.owner !== game.currentPlayer) continue
      if (!isValidMove([r, c])) continue
      const hash = r + "," + c
      if (!moveHashes.has(hash)) {
        yield [r, c]
        moveHashes.add(hash)
      }
    }
  }

  // return all other spots near gems
  if (!includeNonShapeMoves) return  // already looked at all possible relevant moves

  for (let r = 0; r < game.board.length; r++) {
    for (let c = 0; c < game.board.length; c++) {
      if (game.board[r][c] === undefined) continue
      // there is a gem here, suggest nearby locations
      const dists = [0, -1, 1, -2, 2]
      for (const dy of dists) {
        for (const dx of dists) {
          // TODO filter symmetric moves in the opening
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
  else if (opponentPenteThreats.length > 0) {
    const myBlockingCaptures = getCapturesBlockingAll(game, opponentPenteThreats)
    nonQuietShapes = [...opponentPenteThreats, ...myBlockingCaptures]
  }
  else nonQuietShapes = [...myOpenTrias, ...myExtendableTrias, ...opponentOpenTrias, ...myCaptureThreats]

  // get moves from shapes - similar logic to the main move generator
  const moves = []

  // setup
  const moveHashes = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const isValidMove = function (move: number[]) {
    if(isRestricted(game, move[0], move[1])) return false
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