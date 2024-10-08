import { makeMove, undoMove, type GameState, type SearchResult, type EvalFlag } from "./model_v9";
import { type TTEntry, transpositionTable, transpositionTableSet, TTableKey } from "./ttable_v9";

let searchNodesVisited = 0
let confirmAlpha = 0
let failHigh = 0
let ttableHit = 0
let ttableMiss = 0

let killerMoves: number[][][] = []  // indexed by: ply, then move -> [r,c]
// will only store at most 2 killer moves per ply, as recommended by wikipedia, to keep them recent / relevant
function addKillerMove(r: number, c: number, ply: number){
  if (!killerMoves[ply]) killerMoves[ply] = []
  // make sure it's a new move
  for (const m of killerMoves[ply]){
    if(m[0] === r && m[1] === c) return
  }
  killerMoves[ply].unshift([r,c])
  if( killerMoves[ply].length >= 2) killerMoves[ply].splice(2)
}


export function findBestMove(game: GameState) {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search

  game = copyGame(game)

  let prevDepthResults: SearchResult[] = []

  for (let depth = 1; depth <= 6; depth++) {
    console.log(`searching depth ${depth}...`)

    killerMoves = []

    searchNodesVisited = 0
    confirmAlpha = 0
    failHigh = 0
    ttableHit = 0
    ttableMiss = 0

    const principalVariation = prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : []
    const results = principalVariationSearch(game, depth, 1, -Infinity, Infinity, principalVariation, prevDepthResults, true)  // start alpha and beta at worst possible scores, and return results for all moves
    prevDepthResults = results

    // log results
    console.log(searchNodesVisited + " nodes visited")
    console.log("confirm alpha", confirmAlpha, "fail high", failHigh)
    console.log("ttable hit", ttableHit, "ttable miss", ttableMiss)
    results.slice(0, 2).forEach(r => {
      const flagChar = r.evalFlag === "exact" ? "=" : r.evalFlag === "upper-bound" ? "≤" : "≥"
      console.log("eval", flagChar, r.eval, JSON.stringify(r.bestVariation))
    })
    console.log("")

    // if found a forced win for either player, no need to keep looking
    if (Math.abs(results[0].eval) === Infinity) break
  }

  return prevDepthResults[0].bestVariation[0]
}



function principalVariationSearch(
  game: GameState, depth: number, ply :number, alpha: number, beta: number, principalVariation: number[][] = [], prevDepthResults: SearchResult[] = [], returnAllMoveResults: boolean = false)
  : SearchResult[] {
  // returns a list of evaluations for either just the best move, or all moves (if all moves, it will be sorted with best moves first)
  // note that the evaluation is from the current player's perspective (higher better)

  // ply counts how deep into the search tree we are so far; depth is how much we have left to go and b/c of late move reductions isn't a good measure of how deep we've gone
  // alpha and beta are used for alpha-beta pruning
  // principalVariation is the remainder of the principal variation from the previous iteration of iterative deepening
  // - the first move in this variation is always searched first and at full depth
  // prevDepthResults (optional): results from previous iteration of iterative deepening, will be used to help order moves
  // returnAllMoveResults is useful for debugging

  searchNodesVisited++

  // leaf node base case
  if (depth === 0 || game.isOver) {
    return [{ eval: evaluatePosition(game), evalFlag: "exact", bestVariation: [] }]
  }

  const alphaOrig = alpha  // we need this in order to correctly set transposition table flags, but I'm unclear for sure why

  // transposition table cutoff / info
  const tableEntry = transpositionTable.get(TTableKey(game))
  if (tableEntry && tableEntry.depth >= depth) {
    ttableHit++
    if (tableEntry.result.evalFlag === "exact" && !returnAllMoveResults) {
      return [tableEntry.result]
    }
    else if (tableEntry.result.evalFlag === "lower-bound") {
      alpha = Math.max(alpha, tableEntry.result.eval)
    }
    else if (tableEntry.result.evalFlag === "upper-bound") {
      beta = Math.min(beta, tableEntry.result.eval)
    }
    if (alpha >= beta && !returnAllMoveResults) {
      // cutoff
      return [tableEntry.result]
    }
  }
  else {
    ttableMiss++
  }

  const allMoveResults: SearchResult[] = []
  let bestResult: SearchResult = { eval: -Infinity, evalFlag: "exact", bestVariation: [] }  // start with worst possible eval

  let moveIndex = 0
  const moveIterator = makeOrderedMoveIterator(game, ply, principalVariation[0], tableEntry, prevDepthResults)
  for (const [r, c] of moveIterator) {
    // search child
    makeMove(game, r, c)
    const restOfPrincipalVariation = principalVariation.slice(1)

    let childResult: SearchResult
    // do full search on the principal variation move, which is probably good
    if (moveIndex == 0) childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, restOfPrincipalVariation)[0]
    else {
      // not first-ordered move, so probably worse, do a fast null window search
      const searchDepth = moveIndex < 3 || depth < 3 ? depth - 1 : depth - 2  // late move reduction
      childResult = principalVariationSearch(game, searchDepth, ply + 1, -alpha - 1, -alpha, restOfPrincipalVariation)[0]  // technically no longer the principal variation, but PV moves are probably still good in other positions
      // if failed high (we found a way to do better), do a full search
      // beta - alpha > 1 avoids a redundant null window search
      if (-childResult.eval > alpha && beta - alpha > 1) {
        failHigh++
        childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, restOfPrincipalVariation)[0]
      }
      else {
        confirmAlpha++
      }
    }
    undoMove(game)

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: childResult.evalFlag === "lower-bound" ? "upper-bound" : "exact",  // only possible result.evalFlag values are "lower-bound" and "exact"
      bestVariation: [[r, c], ...childResult.bestVariation]
    }
    allMoveResults.push(myResult)

    // if no result recorded yet, ours is the best (important not to skip this, so that we end up with a meaningful variation)
    if (bestResult.bestVariation.length === 0) bestResult = myResult
    // use strict inequality for max, b/c we would like to retain the earlier (more sensible) moves
    if (myResult.eval > bestResult.eval) {
      bestResult = myResult
    }

    // alpha-beta pruning: if the opponent could force a worse position for us elsewhere in the tree (beta) than we could force here (alpha),
    // they would avoid coming here, so we can stop looking at this node
    alpha = Math.max(alpha, bestResult.eval)
    if (beta <= alpha) {
      addKillerMove(r, c, ply)
      break
    }
    moveIndex++
  }

  if (bestResult.eval <= alphaOrig) bestResult.evalFlag = "upper-bound"
  else if (bestResult.eval >= beta) bestResult.evalFlag = "lower-bound"
  else bestResult.evalFlag = "exact"

  transpositionTableSet(game, bestResult, depth)

  // return
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
    prevMoves: JSON.parse(JSON.stringify(game.prevMoves)),
    isOver: game.isOver,
    linearShapes: JSON.parse(JSON.stringify(game.linearShapes))
  }
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
  "extendable-tria": 7,
  "extendable-stretch-tria": 8,
  "extendable-stretch-tria-threatened": 9,
  "capture-threat": 10,
  "stretch-two": 11,
  "open-pair": 12,
  "open-tessera": 20,  // nothing you can do except maybe a capture, which would mean looking at capture-threat shapes first
  "pente": 30  // nothing you can do
}




export function* makeOrderedMoveIterator(
  game: GameState,
  ply: number,
  principalVariationMove: number[] | undefined = undefined,
  tableEntry: TTEntry | undefined = undefined,
  prevDepthResults: SearchResult[] = []
) {
  // because good moves often cause a cutoff, don't generate more less-good moves unless needed
  // so, create an iterator that generates moves as needed (using generator syntax for readability)

  // first move must be in center
  if (game.nMoves === 0) {
    const center = Math.floor(game.board.length / 2)
    return [[center, center]]
  }

  // setup
  const moveHashes = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const isValidMove = function (move: number[]) {
    return game.board[move[0]][move[1]] === undefined
  }

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
  if (killerMoves[ply]){
    for (const move of killerMoves[ply]){
      if (!isValidMove(move)) continue
      const hash = move[0] + "," + move[1]
      if (!moveHashes.has(hash)) {
        yield move
        moveHashes.add(hash)
      }
    }
  }


  // rank by heuristics

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

  // use order from prevDepthResults - this will contain all remaining moves, ranked
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
  }
  else {
    // return all other spots near gems
    for (let r = 0; r < game.board.length; r++) {
      for (let c = 0; c < game.board.length; c++) {
        if (game.board[r][c] === undefined) continue
        // there is a gem here, suggest nearby locations
        const dists = [0, -1, 1, -2, 2]
        for (const dy of dists) {
          for (const dx of dists) {
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
    "extendable-stretch-tria-threatened": -10,  // recognized instead of capture threat so give it capture threat score
    "stretch-two": 8
  }
  // go through shapes and count them, as well as sum up individual shape eval
  let shapeEval = 0
  let triaCountMe = 0
  let triaCountOpponent = 0
  for (const shape of game.linearShapes) {
    if (["open-tria", "stretch-tria"].includes(shape.type)) {
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