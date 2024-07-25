import { copyGame, makeMove, type GameState, type LinearShape } from "@/model";

let searchNodesVisited = 0


export function findBestMove(game: GameState) {
  // minimax search with alpha beta pruning and iterative deepening

  let evalEstimates: { move: number[], eval: number }[] = []

  for (let depth = 1; depth <= 3; depth++) {
    console.log(`searching depth ${depth}...`)

    searchNodesVisited = 0
    const result = searchStep(game, depth, -Infinity, Infinity, evalEstimates)  // start alpha and beta at worst possible scores
    console.log(searchNodesVisited + " nodes visited")

    evalEstimates = result.variations.map(v => { return { move: v.moves[0], eval: v.eval } })
    result.variations.slice(0, 3).forEach(v => console.log(v.eval, v.evalCouldBe, JSON.stringify(v.moves)))

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

  // get evaluation from linear shapes
  const shapes = findLinearShapes(game)
  let shapeEval = 0
  shapes.forEach(s => shapeEval += s.evaluation)

  // capture eval
  const captureEval = 20 * (game.captures[1] - game.captures[0])

  return shapeEval + captureEval
}



const linearShapeDef = {
  // shapes are defined from the perspective of me as 1 and opponent as 0, with positive eval being good for me
  // shapes should be defined with a positive evaluation
  // they will be automatically flipped by the code, so don't have to include both forwards/backwards versions of asymmetrical patterns
  "pente": { pattern: "11111", evaluation: Infinity },
  "open-tessera": { pattern: "_1111_", evaluation: 10000 },
  "open-tria": { pattern: "_111_", evaluation: 30 },
  "stretch-tria": { pattern: "_11_1_", evaluation: 30 }, // eval will be dampened by the contained open pair
  "open-pair": { pattern: "_00_", evaluation: 5 },
  "capture-threat": { pattern: "100_", evaluation: 15 }, // should be better than opponent just having an open pair
  "stretch-two": { pattern: "_1_1_", evaluation: 5 },
}

// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. 011_ for a capture threat
const linearShapes = new Map()
let maxLinearShapeLength = 0

for (const [name, { pattern, evaluation }] of Object.entries(linearShapeDef)) {
  // add forward and backwards patterns
  linearShapes.set(pattern, { name: name, evaluation: evaluation, length: pattern.length })
  linearShapes.set(pattern.split("").reverse().join(""), { name: name, evaluation: evaluation, length: pattern.length })
  // do it for the other player
  const patternSwitchPlayers = pattern.replace(/1/g, "x").replace(/0/g, "1").replace(/x/g, "0")
  linearShapes.set(patternSwitchPlayers, { name: name, evaluation: -evaluation, length: pattern.length })
  linearShapes.set(patternSwitchPlayers.split("").reverse().join(""), { name: name, evaluation: -evaluation, length: pattern.length })
  // update max length
  maxLinearShapeLength = Math.max(pattern.length, maxLinearShapeLength)
}
// create regex
for (const [pattern, patternInfo] of linearShapes.entries()) {
  patternInfo.regex = new RegExp(pattern, "g")
}



export function updateLinearShapes(game: GameState, r0: number, c0: number) {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones

  // remove any shapes that are no longer there
  game.linearShapes = game.linearShapes.filter(shape => {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      const s = game.board[r][c] === null ? "_" : String(game.board[r][c])
      if (s !== shape.pattern[i]) return false
    }
    return true
  })

  // add new shapes

  // iterate over each of four directions
  for (const dir of [[0, 1], [1, 0], [1, 1], [-1, 1]]) { // row, col, (\) diagonal, (/) diagonal
    let s = ""
    let rInit = r0 - (maxLinearShapeLength - 1) * dir[0]
    let cInit = c0 - (maxLinearShapeLength - 1) * dir[1]
    for (let i = 0, r = rInit, c = cInit; i < 2 * maxLinearShapeLength - 1; i++, r += dir[0], c += dir[1]) {
      if (r < 0 || c < 0 || r >= game.board.length || c >= game.board[0].length) continue
      const value = game.board[r][c]
      s += value === null ? "_" : value
    }
    // search for each pattern
    for (const [pattern, patternInfo] of linearShapes.entries()) {
      for (const match of s.matchAll(patternInfo.regex)) {
        const shape: LinearShape = {
          type: patternInfo.name,
          pattern: pattern,
          goodFor: patternInfo.evaluation <= 0 ? 0 : 1,
          begin: [
            rInit + dir[0] * match.index,
            cInit + dir[1] * match.index
          ],
          end: [  // inclusive index
            rInit + dir[0] * (match.index + patternInfo.length - 1),
            cInit + dir[1] * (match.index + patternInfo.length - 1)
          ],
          length: patternInfo.length,
          hash: ""  // placeholder, see below
        }
        shape.hash = [shape.type, shape.goodFor, shape.begin, shape.end].join()
        if (!game.linearShapes.some(existingShape => existingShape.hash === shape.hash)) {
          game.linearShapes.push(shape)
        }
      }
    }
  }
}




export function findLinearShapes(game: GameState) {
  // map board to characters for easier lookup
  const charBoard = game.board.map(row => row.map(x => x === null ? "_" : String(x)))

  const results = []

  const nRows = game.board.length;
  const nCols = game.board[0].length;

  // search rows
  for (let r = 0; r < nRows; r++) {
    const rowString = charBoard[r].join("")
    for (const patternInfo of linearShapes.values()) {
      for (const match of rowString.matchAll(patternInfo.regex)) {
        results.push({
          name: patternInfo.name,
          evaluation: patternInfo.evaluation,
          start: [r, match.index],
          end: [r, match.index + patternInfo.length - 1] //inclusive index
        })
      }
    }
  }
  // search cols
  for (let c = 0; c < nCols; c++) {
    let colString = ""
    for (let r = 0; r < nRows; r++) {
      colString += charBoard[r][c]
    }
    for (const patternInfo of linearShapes.values()) {
      for (const match of colString.matchAll(patternInfo.regex)) {
        results.push({
          name: patternInfo.name,
          evaluation: patternInfo.evaluation,
          start: [match.index, c],
          end: [match.index + patternInfo.length - 1, c] //inclusive index
        })
      }
    }
  }
  // search diagonal \
  for (let diag = 0; diag < nRows + nCols - 1; diag++) {
    let diagString = ""
    let rInit = Math.max(0, nRows - 1 - diag)
    let cInit = Math.max(0, diag - nRows + 1)
    for (let r = rInit, c = cInit; r < nRows && c < nCols; r++, c++) {
      diagString += charBoard[r][c]
    }
    for (const patternInfo of linearShapes.values()) {
      for (const match of diagString.matchAll(patternInfo.regex)) {
        results.push({
          name: patternInfo.name,
          evaluation: patternInfo.evaluation,
          start: [rInit + match.index, cInit + match.index],
          end: [rInit + match.index + patternInfo.length - 1, cInit + match.index + patternInfo.length - 1]
        })
      }
    }
  }
  // search diagonal /
  for (let diag = 0; diag < nRows + nCols - 1; diag++) {
    let diagString = ""
    let rInit = Math.min(nRows - 1, diag)
    let cInit = Math.max(0, diag - nRows + 1)

    for (let r = rInit, c = cInit; r >= 0 && c < nCols; r--, c++) {
      diagString += charBoard[r][c]
    }
    for (const patternInfo of linearShapes.values()) {
      for (const match of diagString.matchAll(patternInfo.regex)) {
        results.push({
          name: patternInfo.name,
          evaluation: patternInfo.evaluation,
          start: [rInit - match.index, cInit + match.index],
          end: [rInit - match.index - patternInfo.length + 1, cInit + match.index + patternInfo.length - 1]
        })
      }
    }
  }

  return results
}
