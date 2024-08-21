import { makeMove, undoMove, type GameState, type SearchResult } from "./model_v18";
import { makeOrderedMoveIterator } from "./move_generation_v18";
import { transpositionTable, transpositionTableSet, TTableKey } from "./ttable_v18";
import { evaluatePosition } from "./evaluation_v18";

let normalNodesVisited = 0
let confirmAlpha = 0
let failHigh = 0
let ttableHit = 0
let ttableMiss = 0
let nMovesGenerated: number[] = []

let killerMoves: number[][][] = []  // indexed by: ply, then move -> [r,c]
// will only store at most 2 killer moves per ply, as recommended by wikipedia, to keep them recent / relevant
function addKillerMove(r: number, c: number, ply: number) {
  if (!killerMoves[ply]) killerMoves[ply] = []
  // make sure it's a new move
  for (const m of killerMoves[ply]) {
    if (m[0] === r && m[1] === c) return
  }
  killerMoves[ply].unshift([r, c])
  if (killerMoves[ply].length >= 2) killerMoves[ply].splice(2)
}



export function chooseMove(game: GameState, maxDepth: number, maxMs: number = Infinity, verbose: boolean = true): number[] | undefined {
  // in the opening, look into several variations and choose one randomly (to create game variation)
  // in middlegame etc. just choose the best move
  if (game.nMoves <= 4) {
    const nVariations = 5
    const results = findBestMoves(game, nVariations, maxDepth, maxMs / nVariations, false, verbose)
    // because only several moves were made, unlikely that any of the proposed moves will be losing
    // so just choose one at random
    const chosen = results[Math.floor(Math.random() * results.length)]
    return chosen.bestVariation[0]
  }
  return findBestMoves(game, 1, maxDepth, maxMs, false, verbose)[0]?.bestVariation[0]
}



export function findBestMoves(game: GameState, variations: number = 1, maxDepth: number, maxMsPerVariation: number = Infinity, absoluteEval: boolean = false, verbose: boolean = true): SearchResult[] {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search
  // if absoluteEval is true, return positive eval if player 0 winning, negative if player 1 winning (otherwise positive means current player winning)

  game = copyGame(game)  // don't mess with the game object we got

  let resultsToReturn: SearchResult[] = []

  searchLoop:
  for (let v = 0; v < variations; v++) {
    if (verbose) console.log("\nVARIATION " + (v + 1) + " ======================")

    const startTime = performance.now()
    const deadlineMs = performance.now() + maxMsPerVariation

    // exclude previously found best moves, to force it to find the next best move
    try {  // test for weird bug
      resultsToReturn.map(x => x.bestVariation[0])
    }
    catch {
      console.log(resultsToReturn)
    }
    const movesToExclude = resultsToReturn.map(x => x.bestVariation[0])
    if (verbose) console.log("excluding " + JSON.stringify(movesToExclude) + "\n")

    let prevDepthResults: SearchResult[] = []

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (verbose) console.log(`searching depth ${depth}...`)

      killerMoves = []

      normalNodesVisited = 0
      confirmAlpha = 0
      failHigh = 0
      ttableHit = 0
      ttableMiss = 0
      nMovesGenerated = []

      const principalVariation = prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : []
      const results = principalVariationSearch(game, depth, 1, -Infinity, Infinity, deadlineMs, [], false, principalVariation, prevDepthResults, movesToExclude, true)  // start alpha and beta at worst possible scores, and return results for all moves

      if (results.length === 0) {
        // ran out of moves
        if (verbose) console.log("No moves left, returning what we have")
        break searchLoop
      }

      // if ran out of time, disregard this result and stop looking
      if (isNaN(results[0].eval)) {
        if (verbose) console.log("ran out of time")
        break
      }

      prevDepthResults = results

      // log results
      if (verbose) {
        console.log(normalNodesVisited + " normal nodes visited")
        console.log("confirm alpha", confirmAlpha, "fail high", failHigh)
        console.log("ttable hit", ttableHit, "ttable miss", ttableMiss)
        console.log((nMovesGenerated.reduce((sum, x) => sum + x, 0) / nMovesGenerated.length).toFixed(2), "moves generated on average")
        console.log("max", Math.max.apply(nMovesGenerated, nMovesGenerated), "moves generated")
        results.slice(0, 1).forEach(r => {
          const flagChar = r.evalFlag === "exact" ? "=" : r.evalFlag === "upper-bound" ? "≤" : "≥"
          console.log("eval", flagChar, r.eval, JSON.stringify(r.bestVariation))
        })
        console.log("")
      }

      // if found a forced win for either player, no need to keep looking
      if (Math.abs(results[0].eval) === Infinity) break
    }

    const answer = prevDepthResults[0]

    if (absoluteEval && game.currentPlayer === 1) {
      // flip eval sign
      answer.eval = -answer.eval
      if (answer.evalFlag === "lower-bound") answer.evalFlag = "upper-bound"
      else if (answer.evalFlag === "upper-bound") answer.evalFlag = "lower-bound"
    }

    resultsToReturn.push(answer)
    // because of late move reductions, variations aren't guaranteed to be in order of best to worst, so sort them
    resultsToReturn.sort((a,b) => {
      if (absoluteEval && game.currentPlayer === 1) return a.eval - b.eval
      return b.eval - a.eval
    })

    if (verbose) {
      console.log("time taken", performance.now() - startTime)
      console.log("---------------------")
    }
  }

  return resultsToReturn
}



function principalVariationSearch(
  game: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  deadlineMs: number,  // performance.now() time we need to finish by
  movesSoFar: number[][],
  usingNullWindow: boolean,
  principalVariation: number[][] = [],
  prevDepthResults: SearchResult[] = [],
  movesToExclude: number[][] = [],  // used for searching multiple variations, by excluding best moves from prev variations
  returnAllMoveResults: boolean = false
)
  : SearchResult[] {

  // returns a list of evaluations for either just the best move, or all moves (if all moves, it will be sorted with best moves first)
  // note that the evaluation is from the current player's perspective (higher better)

  // ply counts how deep into the search tree we are so far; depth is how much we have left to go and b/c of late move reductions isn't a good measure of how deep we've gone
  // alpha and beta are used for alpha-beta pruning
  // principalVariation is the remainder of the principal variation from the previous iteration of iterative deepening
  // - the first move in this variation is always searched first and at full depth
  // prevDepthResults (optional): results from previous iteration of iterative deepening, will be used to help order moves
  // returnAllMoveResults is useful for debugging

  normalNodesVisited++

  // ran out of time base case - don't allow for original depth 1 search because need to return something
  if (performance.now() > deadlineMs && !(ply === 1 && depth === 1)) {
    // return eval = NaN to indicate ran out of time and to disregard
    return [{ eval: NaN, evalFlag: "exact", bestVariation: [] }]
  }

  // leaf node base cases
  const evaluation = evaluatePosition(game)
  if (game.isOver || depth === 0 || (ply > 1 && Math.abs(evaluation) === Infinity)) {  // need to check ply > 1 if we evaluate forcing win/loss, so that we will actually generate some move
    return [{ eval: evaluation, evalFlag: "exact", bestVariation: [] }]
  }

  const alphaOrig = alpha  // we need this in order to correctly set transposition table flags, but I'm unclear for sure why
  const allMoveResults: SearchResult[] = []
  let bestResult: SearchResult = { eval: -Infinity, evalFlag: "exact", bestVariation: [] }  // start with worst possible eval

  // transposition table cutoff / info
  const tableEntry = transpositionTable.get(TTableKey(game))
  if (tableEntry && tableEntry.depth >= depth) {
    ttableHit++
    // if (tableEntry.result.evalFlag === "exact" && !returnAllMoveResults) {
    //   return [tableEntry.result]
    // }
    // else if (tableEntry.result.evalFlag === "lower-bound") {
    //   alpha = Math.max(alpha, tableEntry.result.eval)
    // }
    // else if (tableEntry.result.evalFlag === "upper-bound") {
    //   beta = Math.min(beta, tableEntry.result.eval)
    // }
    // if (alpha >= beta && !returnAllMoveResults) {
    //   // cutoff
    //   return [tableEntry.result]
    // }
  }
  else {
    ttableMiss++
  }

  let moveIndex = 0
  const moveIterator = makeOrderedMoveIterator(game, ply, principalVariation[0], tableEntry, killerMoves, prevDepthResults)
  for (const [r, c] of moveIterator) {
    if (movesToExclude.some(move => move[0] === r && move[1] === c)) {
      continue
    }

    // search child
    makeMove(game, r, c)
    const restOfPrincipalVariation = principalVariation.slice(1)

    let childResult: SearchResult
    // do full search on the principal variation move, which is probably good
    if (moveIndex == 0) childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, deadlineMs, [...movesSoFar, [r, c]], usingNullWindow, restOfPrincipalVariation)[0]
    else {
      // not first-ordered move, so probably worse, do a fast null window search
      let searchDepth = (depth >= 3 && moveIndex >= 5) ? depth - 2 : depth - 1  // apply late move reduction
      childResult = principalVariationSearch(game, searchDepth, ply + 1, -alpha - 1, -alpha, deadlineMs, [...movesSoFar, [r, c]], true, restOfPrincipalVariation)[0]  // technically no longer the principal variation, but PV moves are probably still good in other positions
      // if failed high (we found a way to do better), do a full search
      // need to check equal to as well as the inequalities, because if the null window was -Infinity, -Infinity, any move will cause a cutoff by being equal to -Infinity
      // beta - alpha > 1 avoids a redundant null window search
      if (alpha <= -childResult.eval && -childResult.eval <= beta && beta - alpha > 1) {
        failHigh++
        childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, deadlineMs, [...movesSoFar, [r, c]], false, restOfPrincipalVariation)[0]
      }
      else {
        confirmAlpha++
      }
    }
    undoMove(game)

    // check for run out of time result
    if (isNaN(childResult.eval)) {
      return [childResult]  // return another dummy result indicating ran out of time
    }

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: (childResult.evalFlag === "lower-bound") ? "upper-bound" : (childResult.evalFlag === "upper-bound") ? "lower-bound" : "exact",
      bestVariation: [[r, c], ...childResult.bestVariation]
    }
    allMoveResults.push(myResult)

    // if no result recorded yet, ours is the best
    // - important not to skip this, so that we end up with a meaningful (i.e. at least "try" to stop the threat) variation in the case that all moves lead to -Infinity eval
    if (bestResult.bestVariation.length === 0) bestResult = myResult
    // check if best so far - exclude upper-bound results from being the best line, for all you know the true eval could be -Infinity
    // use strict inequality for max, b/c we would like to retain the earlier (more sensible) moves
    else if (myResult.eval > bestResult.eval && myResult.evalFlag !== "upper-bound") {
      bestResult = myResult
    }
    // if we found another way to force a win that's shorter, prefer that one
    // don't do this for normal moves, because then it will prefer a line where someone does something dumb with the same result (e.g. losing anyways)
    else if (myResult.eval === Infinity && myResult.evalFlag !== "upper-bound" && myResult.bestVariation.length < bestResult.bestVariation.length) {
      bestResult = myResult
    }
    // if dead lost, prefer the longer line
    else if (myResult.eval === -Infinity && myResult.evalFlag !== "lower-bound" && myResult.bestVariation.length > bestResult.bestVariation.length) {
      bestResult = myResult
    }


    // alpha-beta pruning: if the opponent could force a worse position for us elsewhere in the tree (beta) than we could force here (best eval),
    // they would avoid coming here, so we can stop looking at this node
    // first check that this move can raise alpha (if upper bound, for all we know the true eval could be -Infinity)
    if (bestResult.evalFlag !== "upper-bound") {
      alpha = Math.max(alpha, bestResult.eval)
      if (bestResult.eval >= beta) {
        if (bestResult.eval !== -Infinity) addKillerMove(r, c, ply)  // you don't get to be a killer move for just being any move in a losing position
        break
      }
    }
    moveIndex++

    // limit branching factor - NOTE: this causes embarassingly wrong evaluations sometimes
    // if (moveIndex >= 20) break
  }
  nMovesGenerated.push(moveIndex)

  if (bestResult.eval <= alphaOrig) bestResult.evalFlag = bestResult.eval === -Infinity ? "exact" : "upper-bound"
  else if (bestResult.eval >= beta) bestResult.evalFlag = bestResult.eval === Infinity ? "exact" : "lower-bound"
  else bestResult.evalFlag = "exact"

  // store in transposition table if not null window (null window used an incorrect assumption, so the conclusion is probably unreliable)
  if (!usingNullWindow) transpositionTableSet(game, bestResult, depth)

  // return
  if (returnAllMoveResults) {
    allMoveResults.sort((a, b) => {
      if (a.evalFlag === "exact" && b.evalFlag !== "exact") return -1
      if (b.evalFlag === "exact" && a.evalFlag !== "exact") return 1
      return b.eval - a.eval
    })
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