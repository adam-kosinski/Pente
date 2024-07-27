import { makeMove, type GameState, type LinearShape } from "@/model";

interface SearchResult {
  eval: number
  evalFlag: EvalFlag
  bestVariation: number[][]
}
type EvalFlag = "exact" | "upper-bound" | "lower-bound"



let searchNodesVisited = 0

export function findBestMove(game: GameState) {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search

  let prevDepthResults: SearchResult[] = []

  for (let depth = 1; depth <= 5; depth++) {
    console.log(`searching depth ${depth}...`)

    searchNodesVisited = 0
    const results = principalVariationSearch(game, depth, -Infinity, Infinity, prevDepthResults, true)  // start alpha and beta at worst possible scores, and return results for all moves
    prevDepthResults = results

    // log results
    console.log(searchNodesVisited + " nodes visited")
    results.slice(0, 2).forEach(r => {
      const flagChar = r.evalFlag === "exact" ? "=" : r.evalFlag === "upper-bound" ? "≤" : "≥"
      console.log("eval", flagChar, r.eval, JSON.stringify(r.bestVariation))
    })

    // if found a forced win for either player, no need to keep looking
    if (Math.abs(results[0].eval) === Infinity) break
  }
}



function principalVariationSearch(
  game: GameState, depth: number, alpha: number, beta: number, prevDepthResults: SearchResult[] = [], returnAllMoveResults: boolean = false)
  : SearchResult[] {
  // returns a list of evaluations for either just the best move, or all moves (if all moves, it will be sorted with best moves first)
  // note that the evaluation is from the current player's perspective (higher better)

  // alpha and beta are used for alpha-beta pruning
  // prevDepthResults (optional): results from previous iteration of iterative deepening, will be used to help order moves
  // returnAllMoveResults is useful for debugging

  searchNodesVisited++

  if (depth === 0 || game.isOver) {
    return [{ eval: evaluatePosition(game), evalFlag: "exact", bestVariation: [] }]
  }

  // generate moves ordered by how good we think they are
  // if we have previous depth results, we don't need to regenerate moves
  let moves = prevDepthResults.length > 0 ? prevDepthResults.map(r => r.bestVariation[0]) : generateMoves(game)
  moves = orderMoves(moves, game, prevDepthResults)

  const allMoveResults: SearchResult[] = []
  let bestResult: SearchResult = { eval: -Infinity, evalFlag: "exact", bestVariation: [] }  // start with worst possible eval

  for (const [r, c] of moves) {
    // search child
    const gameCopy = copyGame(game)
    makeMove(gameCopy, r, c)
    const childResult = principalVariationSearch(gameCopy, depth - 1, -beta, -alpha)[0]

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: childResult.evalFlag === "lower-bound" ? "upper-bound" : "exact",  // only possible result.evalFlag values are "lower-bound" and "exact"
      bestVariation: [[r, c], ...childResult.bestVariation]
    }
    allMoveResults.push(myResult)

    if (myResult.eval > bestResult.eval) {
      bestResult = myResult
    }

    // alpha-beta pruning: if the opponent could force a worse position for us elsewhere in the tree (beta) than we could force here (alpha),
    // they would avoid coming here, so we can stop looking at this node
    alpha = Math.max(alpha, bestResult.eval)
    if (beta <= alpha) {
      myResult.evalFlag = "lower-bound"  // it's possible we could have forced even better in this position, but we stopped looking
      break
    }
  }
  if (returnAllMoveResults) {
    allMoveResults.sort((a, b) => b.eval - a.eval)
    return allMoveResults
  }
  return [bestResult]
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
export function orderMoves(moves: number[][], game: GameState, prevDepthResults: SearchResult[] = []) {
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
  interestingMoves.sort((a, b) => {
    const aValue = shapeLocationPriorities.get(JSON.stringify(a))
    const bValue = shapeLocationPriorities.get(JSON.stringify(b))
    return aValue - bValue
  })
  const sortedMoves = [...interestingMoves, ...boringMoves]


  // use prev depth results if we have them from iterative deepening, prioritize this sorting over the previous heuristics
  if (prevDepthResults.length > 0) {
    // make a map for faster eval lookup and thus faster sorting
    const evalMap = new Map()
    prevDepthResults.forEach(r => evalMap.set(JSON.stringify(r.bestVariation[0]), r.eval))
    sortedMoves.sort((a,b) => evalMap.get(JSON.stringify(b)) - evalMap.get(JSON.stringify(a)))
  }

  return sortedMoves
}



export function evaluatePosition(game: GameState) {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // because we used negamax for the search function, a higher evaluation is better for the current player, regardless of who that is

  // check for winning position
  if (game.isOver) {
    // player who just moved won (not current player)
    return -Infinity
  }
  // if current player has a pente threat, they've won
  if (game.linearShapes.some(shape => shape.type.includes("pente-threat") && shape.owner === game.currentPlayer)) {
    return Infinity
  }

  // get evaluation from linear shapes
  // below, higher eval is better for player owning this shape
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
  let triaCountMe = 0
  let triaCountOpponent = 0
  for (const shape of game.linearShapes) {
    if (shape.type.includes("tria")) {
      shape.owner === game.currentPlayer ? triaCountMe++ : triaCountOpponent++
    }
    if (shape.type in shapeEvalConfig) {
      shapeEval += (shape.owner === game.currentPlayer ? shapeEvalConfig[shape.type] : -shapeEvalConfig[shape.type])
    }
  }

  // if someone has a double tria, that's essentially an open tessera if not cleverly stopped, score highly
  // if both people have a double tria, it's my move, so I can take advantage of it first and I get the bonus
  const doubleTriaEval = 5000
  if (triaCountMe >= 2) shapeEval += doubleTriaEval
  else if (triaCountOpponent >= 2) shapeEval -= doubleTriaEval

  // capture eval
  // TODO - 0 vs 1 capture is not quite as big a difference as 3 vs 4 captures
  const captureEval = 20 * (game.captures[game.currentPlayer] - game.captures[Number(!game.currentPlayer) as 0 | 1])

  // TODO add iniative eval based on forcing shapes like trias and capture threats

  return shapeEval + captureEval
}





// if we ever need to find all linear shapes, can just use the updateLinearShapes function on the places
// that have stones