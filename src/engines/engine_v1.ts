import { makeMove, type GameState, type LinearShape } from "@/model";

let searchNodesVisited = 0

export function findBestMove(game: GameState) {
  // minimax search with alpha beta pruning and iterative deepening

  let evalEstimates: { move: number[], eval: number }[] = []

  for (let depth = 1; depth <= 5; depth++) {
    console.log(`searching depth ${depth}...`)

    searchNodesVisited = 0
    const result = searchStep(game, depth, -Infinity, Infinity, evalEstimates)  // start alpha and beta at worst possible scores
    evalEstimates = result.variations.map(v => { return { move: v.moves[0], eval: v.eval } })

    // log results
    console.log(searchNodesVisited + " nodes visited")
    result.variations.slice(0, 2).forEach(v => {
      let evalString = "eval "
      if (v.evalCouldBe === Infinity) evalString += "≥"
      if (v.evalCouldBe === -Infinity) evalString += "≤"
      evalString += v.eval
      console.log(evalString, JSON.stringify(v.moves))
    })

    // if found a forced win, no need to keep looking
    if (Math.abs(result.eval) === Infinity) break
  }
}



function searchStep(game: GameState, depth: number, alpha: number, beta: number, evalEstimates: { move: number[], eval: number }[] = [])
  : { eval: number, evalCouldBe?: number, moves: number[][], variations: any[] } {
  // returns an evaluation of the position, along with the list of moves that led there from this position
  // - NOTE: also might return evalCouldBe, to express uncertainty resulting from pruning (a node might have eval <= -40)
  //         If specified, will be -Infinity or Infinity; the actual eval could be anywhere between eval and evalCouldBe
  // alpha and beta are used for alpha-beta pruning
  // evalEstimates (optional): we might already have info about existing moves / which order to search (from iterative deepening)
  // - first moves are better, and note that the moveRanking may not include all possible moves because of pruning
  //   based on info from the previous depth (so we need to regenerate moves)

  searchNodesVisited++

  if (depth === 0 || game.isOver) {
    return { eval: evaluatePosition(game), moves: [], variations: [] }
  }

  // generate moves ordered by how good we think they are
  let moves = generateMoves(game)
  moves = orderMoves(moves, game, evalEstimates)

  const evaluatedVariations = []  // store these so we can output a ranking
  let bestEval: number
  let evalCouldBe: number = 0  // 0 is placeholder, when used will be -Infinity or Infinity
  let bestVariation: number[][] = [] // list of future moves (including the current best move) leading to the best eval, comes from recursion

  if (game.currentPlayer === 0) {
    // minimizing player
    bestEval = Infinity  // start with worst possible eval

    for (let i = 0; i < moves.length; i++) {
      const [r, c] = moves[i]

      const gameCopy = copyGame(game)
      makeMove(gameCopy, r, c)
      const result = searchStep(gameCopy, depth - 1, alpha, beta)

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval, evalCouldBe: result.evalCouldBe })
      if (bestVariation.length === 0) bestVariation = [[r, c], ...result.moves]
      if (result.eval < bestEval) {
        bestEval = result.eval
        bestVariation = [[r, c], ...result.moves]
      }
      beta = Math.min(beta, bestEval)
      // if the smallest eval that player 0 could force here is a lower aka better eval than what player 1 could force elsewhere in the tree (alpha)
      // then player 1 would avoid coming here in the first place, so stop looking (prune)
      if (bestEval <= alpha) {
        evalCouldBe = -Infinity
        break
      }
    }
    evaluatedVariations.sort((a, b) => a.eval - b.eval)
  }
  else {
    // maximizing player
    bestEval = -Infinity  // start with worst possible eval

    for (let i = 0; i < moves.length; i++) {
      const [r, c] = moves[i]

      const gameCopy = copyGame(game)
      makeMove(gameCopy, r, c)
      const result = searchStep(gameCopy, depth - 1, alpha, beta)

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval, evalCouldBe: result.evalCouldBe })
      if (bestVariation.length === 0) bestVariation = [[r, c], ...result.moves]
      if (result.eval > bestEval) {
        bestEval = result.eval
        bestVariation = [[r, c], ...result.moves]
      }

      alpha = Math.max(alpha, bestEval)
      // if the largest eval player 1 could force here is a higher aka better eval than what player 0 could force elsewhere in the tree (beta)
      // then player 1 would avoid coming here in the first place, so stop looking (prune)
      if (bestEval >= beta) {
        evalCouldBe = Infinity
        break
      }
    }
    evaluatedVariations.sort((a, b) => b.eval - a.eval)
  }

  const evalUncertainty = evalCouldBe !== 0 ? { evalCouldBe: evalCouldBe } : {}
  // if (bestVariation.length !== depth && evalCouldBe === 0) console.warn(bestVariation, updatedMax, "eval", bestEval, "depth", depth, "alpha", alpha, "beta", beta)
  return { eval: bestEval, ...evalUncertainty, moves: bestVariation, variations: evaluatedVariations }
}



export function copyGame(game: GameState): GameState {
  return {
    board: game.board.map(row => Object.assign({}, row)),
    currentPlayer: game.currentPlayer,
    captures: { ...game.captures },
    nMoves: game.nMoves,
    isOver: game.isOver,
    linearShapes: JSON.parse(JSON.stringify(game.linearShapes))
  }
}



// TODO take advantage of symmetry to avoid redundant moves (particularly an issue in the beginning - perhaps can check for symmetry only when game.nMoves is low)

export function generateMoves(game: GameState): number[][] {
  // returns a list of [row, col] moves

  // first move must be in center
  if (game.nMoves === 0) {
    const center = Math.floor(game.board.length / 2)
    return [[center, center]]
  }

  // look for spots with pieces and add the neighborhood to the move list
  // (limit moves to a short distance away horizontally and vertically from an existing piece for efficiency)
  const nearSpots = new Map() // using map so we can deduplicate based on string keys but we have the objects sitting there
  for (let r = 0; r < game.board.length; r++) {
    for (let c = 0; c < game.board.length; c++) {
      if (game.board[r][c] === undefined) continue
      // there is a piece here, add the neighborhood - will check for if spots are empty once added to the set, to avoid duplicate checks
      const dists = [0, -1, 1, -2, 2]
      for (const dy of dists) {
        for (const dx of dists) {
          if (r + dy >= 0 && r + dy < game.board.length && c + dx >= 0 && c + dx < game.board.length) {
            nearSpots.set(`${r + dy},${c + dx}`, [r + dy, c + dx])
          }
        }
      }
    }
  }
  // filter for open spaces only
  const moves = []
  for (const [r, c] of nearSpots.values()) {
    if (game.board[r][c] === undefined) moves.push([r, c])
  }
  return moves
}


// store which shapes should be looked at first, to use when ordering moves
// lower number is more important
// using an object instead of an array for faster lookup
const shapePriority: Record<string, number> = {
  "pente-threat-22": 2,
  "pente-threat-4": 3,
  "pente-threat-31": 4,
  "open-tria": 5,
  "stretch-tria": 6,
  "capture-threat": 7,
  "open-pair": 8,
  "stretch-two": 9,
  "open-tessera": 20,  // nothing you can do except maybe a capture, which would mean looking at capture-threat shapes first
  "pente": 20  // nothing you can do
}
export function orderMoves(moves: number[][], game: GameState, evalEstimates: { move: number[], eval: number }[] = []) {
  // takes a list of moves and optionally a list of evaluation estimates (probably from iterative deepening)
  // and sorts the moves (not in place) based on heuristics and the eval estimates, best moves first (if maximizing, these are highest eval)

  // rank by heuristics

  // if move is part of an existing shape, it is probably interesting
  // also, if it is part of a forcing shape it is probably more interesting, so also write down a priority
  const shapeLocationPriorities = new Map()  // "[r,c]": priority
  for (const shape of game.linearShapes) {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      if (game.board[r][c] === undefined) {  // valid move spot
        const key = JSON.stringify([r, c])
        const existingPriority = shapeLocationPriorities.get(key)
        if (existingPriority !== undefined) {
          shapeLocationPriorities.set(key, Math.min(shapePriority[shape.type], existingPriority))
        }
        else {
          shapeLocationPriorities.set(key, shapePriority[shape.type])
        }
      }
    }
  }
  const interestingMoves = []
  const boringMoves = []
  for (const move of moves) {
    if (shapeLocationPriorities.has(JSON.stringify(move))) interestingMoves.push(move)
    else boringMoves.push(move)
  }
  interestingMoves.sort((a,b) => {
    const aValue = shapeLocationPriorities.get(JSON.stringify(a))
    const bValue = shapeLocationPriorities.get(JSON.stringify(b))
    return aValue - bValue
  })
  const sortedMoves = [...interestingMoves, ...boringMoves]

  // use eval estimates if we have them (may not include all possible moves because of pruning)
  // usually we only have eval estimates at the search tree root node, provided by the previous iteration of iterative deepening
  // so typically this won't execute

  if (evalEstimates.length > 0) {
    // associate all moves with an eval score in a data structure (if not ranked, give eval score 0)
    const evalMap = new Map()
    evalEstimates.forEach(obj => evalMap.set(JSON.stringify(obj.move), obj.eval))
    sortedMoves.forEach(move => {
      const moveString = JSON.stringify(move)
      if (!evalMap.has(moveString)) evalMap.set(moveString, 0)
    })
    sortedMoves.sort((a, b) => {
      const diff = evalMap.get(JSON.stringify(b)) - evalMap.get(JSON.stringify(a))
      return game.currentPlayer === 1 ? diff : -diff
    })
  }

  return sortedMoves  // in case we want to chain stuff
}



export function evaluatePosition(game: GameState) {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // player 0 wants a low (negative) eval, player 1 wants a high (positive) eval

  // check for winning position
  if (game.isOver) {
    // player who just moved won (not current player)
    return game.currentPlayer === 0 ? Infinity : -Infinity
  }
  // if current player has a pente threat, they've won
  for (const shape of game.linearShapes) {
    if (game.linearShapes.some(shape => shape.type.includes("pente-threat") && shape.owner === game.currentPlayer)) {
      return game.currentPlayer === 0 ? -Infinity : Infinity
    }
  }

  // get evaluation from linear shapes
  // eval config below is for if player 1 is the owner (where higher eval is better)
  const shapeEvalConfig: Record<string, number> = {
    "open-tessera": 10000,
    "open-tria": 25,
    "stretch-tria": 20,
    "open-pair": -5,
    "pente-threat-4": 15,  // pente threats aren't marked as super good in a vaccuum b/c often they are good tactically
    "pente-threat-31": 15,
    "pente-threat-22": 15,  // if pairs are vulnerable, the open-pair penalty will apply
    "capture-threat": 10, // compare with open pair (should be better to threaten), and with capture reward (should be more)
    "stretch-two": 8
  }
  // go through shapes and count them, as well as sum up individual shape eval
  let shapeEval = 0
  let triaCount0 = 0
  let triaCount1 = 0
  for (const shape of game.linearShapes) {
    if (shape.type.includes("tria")) {
      shape.owner === 0 ? triaCount0++ : triaCount1++
    }
    if (shape.type in shapeEvalConfig) {
      shapeEval += (shape.owner === 1 ? shapeEvalConfig[shape.type] : -shapeEvalConfig[shape.type])
    }
  }

  // if someone has a double tria, that's essentially an open tessera, score highly
  // if both people have a double tria, whoever's move it is right now gets the bonus
  const doubleTriaEval = 5000
  if (triaCount0 >= 2 && triaCount1 >= 2) shapeEval += (game.currentPlayer === 0 ? -doubleTriaEval : doubleTriaEval)
  else if (triaCount0 >= 2) shapeEval -= doubleTriaEval
  else if (triaCount1 >= 2) shapeEval += doubleTriaEval


  // capture eval
  // TODO - 0 vs 1 capture is not quite as big a difference as 3 vs 4 captures
  const captureEval = 20 * (game.captures[1] - game.captures[0])

  // TODO add iniative eval based on forcing shapes like trias and capture threats

  return shapeEval + captureEval
}





// if we ever need to find all linear shapes, can just use the updateLinearShapes function on the places
// that have stones