import { copyGame, makeMove, type GameState } from "@/model";

export function findBestMove(game: GameState) {
  // minimax search with alpha beta pruning and iterative deepening

  let rankedMoves: number[][] = []

  for (let depth = 1; depth <= 3; depth++) {
    console.log(`searching depth ${depth}...`)
    const result = searchStep(game, depth, -Infinity, Infinity, rankedMoves)  // start alpha and beta at worst possible scores
    rankedMoves = result.variations.map(v => v.moves[0])
    result.variations.slice(0, 3).forEach(v => console.log(v.eval, JSON.stringify(v.moves)))
  }
}


function searchStep(game: GameState, depth: number, alpha: number, beta: number, moves: number[][] = [])
  : { eval: number, moves: number[][], variations: any[] } {
  // returns an evaluation of the position, along with the list of moves that led there from this position
  // alpha: worst evaluation (smallest) the maximizing player (player 1) can force
  // beta: worst evaluation (largest) the minimizing player (player 0) can force
  // moves: we might already have info about existing moves / which order to search (from iterative deepening), allow passing that to this function instead of requiring this function to generate moves

  const evaluation = evaluatePosition(game)
  if (depth === 0 || Math.abs(evaluation) === Infinity) {
    return { eval: evaluation, moves: [], variations: [] }
  }

  if (moves.length === 0) moves = generateMoves(game)
  const evaluatedVariations = []  // store these so we can output a ranking

  let bestEval: number
  let bestVariation: number[][] = [] // list of future move (including the current best move) leading to the best eval, comes from recursion

  if (game.currentPlayer === 0) {
    // minimizing player
    bestEval = Infinity  // start with worst possible eval
    for (const [r, c] of moves) {
      const gameCopy = copyGame(game)
      makeMove(gameCopy, r, c)
      const result = searchStep(gameCopy, depth - 1, alpha, beta)

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval })
      if (result.eval < bestEval) {
        bestEval = result.eval
        bestVariation = [[r, c], ...result.moves]
      }
      // alpha cutoff
      // if (bestEval < alpha) break
      // beta update
      beta = Math.min(beta, bestEval)
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

      evaluatedVariations.push({ moves: [[r, c], ...result.moves], eval: result.eval })
      if (result.eval > bestEval) {
        bestEval = result.eval
        bestVariation = [[r, c], ...result.moves]
      }
      // beta cutoff
      // if (bestEval > beta) break
      // alpha update
      alpha = Math.max(alpha, bestEval)
    }
    evaluatedVariations.sort((a, b) => b.eval - a.eval)
  }

  return { eval: bestEval, moves: bestVariation, variations: evaluatedVariations }
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
  // they will be automatically flipped by the code, so don't have to include both forwards/backwards versions of asymmetrical patterns
  "pente": { pattern: "11111", evaluation: Infinity },
  "open-tessera": { pattern: "_1111_", evaluation: 10000 },
  "open-tria": { pattern: "_111_", evaluation: 30 },
  "stretch-tria": { pattern: "_11_1_", evaluation: 30 }, // eval will be dampened by the contained open pair
  "open-pair": { pattern: "_11_", evaluation: -5 },
  "capture-threat": { pattern: "011_", evaluation: -15 }, // should be worse than just having an open pair
  "stretch-two": { pattern: "_1_1_", evaluation: 5 },
}
// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. /011_/g for a capture threat
const linearShapes = new Map()
for (const [name, { pattern, evaluation }] of Object.entries(linearShapeDef)) {
  // add forward and backwards patterns
  linearShapes.set(pattern, { name: name, evaluation: evaluation, length: pattern.length })
  linearShapes.set(pattern.split("").reverse().join(""), { name: name, evaluation: evaluation, length: pattern.length })
  // do it for the other player
  const patternSwitchPlayers = pattern.replace(/1/g, "x").replace(/0/g, "1").replace(/x/g, "0")
  linearShapes.set(patternSwitchPlayers, { name: name, evaluation: -evaluation, length: pattern.length })
  linearShapes.set(patternSwitchPlayers.split("").reverse().join(""), { name: name, evaluation: -evaluation, length: pattern.length })
}
// create regex
for (const [pattern, patternInfo] of linearShapes.entries()) {
  patternInfo.regex = new RegExp(pattern, "g")
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