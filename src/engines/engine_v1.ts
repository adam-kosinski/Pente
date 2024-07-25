import { copyGame, makeMove, type GameState, type LinearShape } from "@/model";

let searchNodesVisited = 0

export function findBestMove(game: GameState) {
  // minimax search with alpha beta pruning and iterative deepening

  let evalEstimates: { move: number[], eval: number }[] = []

  for (let depth = 1; depth <= 3; depth++) {
    console.log(`searching depth ${depth}...`)

    searchNodesVisited = 0
    const result = searchStep(game, depth, -Infinity, Infinity, evalEstimates)  // start alpha and beta at worst possible scores
    evalEstimates = result.variations.map(v => { return { move: v.moves[0], eval: v.eval } })

    // log results
    console.log(searchNodesVisited + " nodes visited")
    result.variations.slice(0, 3).forEach(v => {
      let evalString = "eval "
      if(v.evalCouldBe === Infinity) evalString += "≥"
      if(v.evalCouldBe === -Infinity) evalString += "≤"
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

  const evaluation = evaluatePosition(game)
  if (depth === 0 || Math.abs(evaluation) === Infinity) {
    return { eval: evaluation, moves: [], variations: [] }
  }

  let moves = generateMoves(game)

  // sort moves based on the move ranking
  orderMoves(moves, game.currentPlayer === 1, evalEstimates)

  const evaluatedVariations = []  // store these so we can output a ranking
  let bestEval: number
  let evalCouldBe: number = 0  // 0 is placeholder, when used will be -Infinity or Infinity
  let bestVariation: number[][] = [] // list of future moves (including the current best move) leading to the best eval, comes from recursion

  if (game.currentPlayer === 0) {
    // minimizing player
    bestEval = Infinity  // start with worst possible eval
    for (const [r, c] of moves) {
      const gameCopy = copyGame(game)
      makeMove(gameCopy, r, c)
      const result = searchStep(gameCopy, depth - 1, alpha, beta)
      if (game.board[10][13] === 1) {
      }

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval, evalCouldBe: result.evalCouldBe })
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
    for (const [r, c] of moves) {
      const gameCopy = copyGame(game)
      makeMove(gameCopy, r, c)
      const result = searchStep(gameCopy, depth - 1, alpha, beta)

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval, evalCouldBe: result.evalCouldBe })
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
  return { eval: bestEval, ...evalUncertainty, moves: bestVariation, variations: evaluatedVariations }
}



// TODO take advantage of symmetry to avoid redundant moves (particularly an issue in the beginning)

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
    for (let c = 0; c < game.board[0].length; c++) {
      if (game.board[r][c] === null) continue
      // there is a piece here, add the neighborhood - will check for if spots are empty once added to the set, to avoid duplicate checks
      const dists = [0, -1, 1]
      for (const dy of dists) {
        for (const dx of dists) {
          if (r + dy >= 0 && r + dy < game.board.length && c + dx >= 0 && c + dx < game.board[0].length) {
            nearSpots.set(`${r + dy},${c + dx}`, [r + dy, c + dx])
          }
        }
      }
    }
  }
  // filter for open spaces only
  const moves = []
  for (const [r, c] of nearSpots.values()) {
    if (game.board[r][c] === null) moves.push([r, c])
  }
  return moves
}



export function orderMoves(moves: number[][], maximizing: boolean, evalEstimates: { move: number[], eval: number }[] = []) {
  // takes a list of moves and optionally a list of evaluation estimates (probably from iterative deepening)
  // and sorts the moves (IN PLACE) based on heuristics and the eval estimates, best moves first (if maximizing, these are highest eval)

  // TODO heuristics

  // use ranking (ranking may not include all possible moves because of pruning)
  // associate all moves with an eval score in a data structure (if not ranked, give eval score 0)
  const evalMap = new Map()
  evalEstimates.forEach(obj => evalMap.set(JSON.stringify(obj.move), obj.eval))
  moves.forEach(move => {
    const moveString = JSON.stringify(move)
    if (!evalMap.has(moveString)) evalMap.set(moveString, 0)
  })
  // moves.forEach(move => evalMap.set(JSON.stringify(move), Math.random()))
  moves.sort((a, b) => {
    const diff = evalMap.get(JSON.stringify(b)) - evalMap.get(JSON.stringify(a))
    return maximizing ? diff : -diff
  })
  return moves  // in case we want to chain stuff
}



export function evaluatePosition(game: GameState) {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // player 0 wants a low (negative) eval, player 1 wants a high (positive) eval

  // check for capture win
  if (game.captures[0] >= 5) return -Infinity
  if (game.captures[1] >= 5) return Infinity

  // TODO get evaluation from linear shapes

  // capture eval
  const captureEval = 20 * (game.captures[1] - game.captures[0])

  return captureEval
}





// if we ever need to find all linear shapes, can just use the updateLinearShapes function on the places
// that have stones