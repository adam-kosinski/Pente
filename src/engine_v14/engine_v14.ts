import { makeMove, undoMove, type GameState, type SearchResult, type EvalFlag, type LinearShape } from "./model_v14";
import { makeOrderedMoveIterator } from "./move_generation_v14";
import { transpositionTable, transpositionTableSet, TTableKey } from "./ttable_v14";

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


export function findBestMove(game: GameState, maxDepth: number, maxMs: number = Infinity, absoluteEval: boolean = false): SearchResult {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search
  // if absoluteEval is true, return positive eval if 1st player winning, negative if 2nd player winning (otherwise positive means current player winning)

  const startTime = performance.now()

  game = copyGame(game)  // don't mess with the game object we got

  const deadlineMs = performance.now() + maxMs

  let prevDepthResults: SearchResult[] = []

  for (let depth = 1; depth <= maxDepth; depth++) {
    console.log(`searching depth ${depth}...`)

    killerMoves = []

    normalNodesVisited = 0
    confirmAlpha = 0
    failHigh = 0
    ttableHit = 0
    ttableMiss = 0
    nMovesGenerated = []

    const principalVariation = prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : []
    const results = principalVariationSearch(game, depth, 1, -Infinity, Infinity, deadlineMs, [], false, principalVariation, prevDepthResults, true)  // start alpha and beta at worst possible scores, and return results for all moves
    
    // if ran out of time, disregard this result and stop looking
    if(isNaN(results[0].eval)) {
      console.log("ran out of time")
      break
    }

    prevDepthResults = results

    // log results
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

  console.log("time taken", performance.now() - startTime)
  return prevDepthResults[0]
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
  returnAllMoveResults: boolean = false)
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

  // ran out of time base case
  if (performance.now() > deadlineMs) {
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

  let moveIndex = 0
  const moveIterator = makeOrderedMoveIterator(game, ply, principalVariation[0], tableEntry, killerMoves, prevDepthResults)
  for (const [r, c] of moveIterator) {
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
    if(isNaN(childResult.eval)){
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
    // UPDATE - commented out because seems buggy?
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

  // store in transposition table if not null window (null window used an incorrect assumption, so the conclusion)
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





export function evaluatePosition(game: GameState) {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // because we used negamax for the search function, a higher evaluation is better for the current player, regardless of who that is

  // check for won / forced winning position - worth expending some effort into this, because it allows the search tree to stop earlier

  if (game.isOver) {
    // player who just moved won (not current player)
    return -Infinity
  }
  // if current player has a pente threat, they've won
  if (game.linearShapes.some(shape => shape.type.includes("pente-threat") && shape.owner === game.currentPlayer)) {
    return Infinity
  }
  // if current player can complete 5 captures, they've won
  if (game.captures[game.currentPlayer] >= 4 && game.linearShapes.some(shape => shape.type === "capture-threat" && shape.owner === game.currentPlayer)) {
    return Infinity
  }
  // we now establish that we can't win immediately on our turn
  // look for unstoppable opponent threats
  const opponentPenteThreats: LinearShape[] = []
  for (const shape of game.linearShapes) {
    // if the opponent has an open tessera that can't be blocked by a capture, they've won
    if (shape.owner !== game.currentPlayer && shape.type === "open-tessera") {
      const blockingCaptures = getBlockingCaptures(game.linearShapes, shape)
      if (blockingCaptures.length === 0) return -Infinity
    }
    else if (shape.owner !== game.currentPlayer && shape.type.includes("pente-threat")) {
      opponentPenteThreats.push(shape)
    }
  }
  // if opponent has multiple pente threats, check if we can block them all
  if (!canBlockAllPenteThreats(game, opponentPenteThreats)) return -Infinity

  // get evaluation from linear shapes
  // below, higher eval is better for player owning this shape
  const shapeEvalConfig: Record<string, number> = {
    "open-tessera": 10000,
    "open-tria": 35,
    "stretch-tria": 25,
    "open-pair": -5,
    "pente-threat-4": 45,
    "pente-threat-31": 45,
    "pente-threat-22": 45,
    "capture-threat": 10, // compare with open pair (should be better to threaten), and with capture reward (should be more)
    "extendable-stretch-tria-threatened": -10,  // recognized instead of capture threat so give it capture threat score
    "stretch-two": 10,
    "double-stretch-two": 7
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


  // initiative eval - opponent threats are bad
  // if the opponent has a pente threat and you don't, you don't have the initative
  // else if the opponent has a tria and you don't, you don't have the initiative
  // else if the opponent has a capture threat and you don't, you don't have the initiative
  // else (opponent has no threats), and you can make a tria (i.e. you have pairs or stretch twos), you have the initiative
  // else you can threaten to capture a pair, you have the initiative
  // ignoring extendable trias for now
  // TODO - incorporate some measure of initiative over time, and how many threats you have waiting for the future
  let initiativeSign = 0
  if (game.linearShapes.some(shape => shape.type.includes("pente-threat") && shape.owner !== game.currentPlayer)) {
    // I don't have a pente threat b/c would have been caught higher up
    initiativeSign = -1  // opponent
  }
  else if (triaCountOpponent > 0 && triaCountMe === 0) initiativeSign = -1
  else if (game.linearShapes.some(shape => shape.type === "capture-threat" && shape.owner !== game.currentPlayer) &&
    !game.linearShapes.some(shape => shape.type === "capture-threat" && shape.owner === game.currentPlayer)) {
    initiativeSign = -1
  }
  else if (game.linearShapes.some(shape => ["open-pair", "stretch-two"].includes(shape.type) && shape.owner === game.currentPlayer)) {
    initiativeSign = 1
  }
  else if (game.linearShapes.some(shape => shape.type === "open-pair" && shape.owner !== game.currentPlayer)) {
    initiativeSign = 1
  }
  const initiativeEval = initiativeSign * 30

  // console.log("initiative", initiativeSign)


  // capture eval
  // TODO - 0 vs 1 capture is not quite as big a difference as 3 vs 4 captures
  const captureEval = 30 * (game.captures[game.currentPlayer] - game.captures[Number(!game.currentPlayer) as 0 | 1])

  const currentPlayerBias = 15  // the current player has a bit of advantage from it being their turn, also helps reduce evaluation flip-flop depending on depth parity

  return shapeEval + initiativeEval + captureEval + currentPlayerBias
}



export function getBlockingCaptures(shapes: LinearShape[], threat: LinearShape): LinearShape[] {
  const blockingCaptures: LinearShape[] = []

  const threatGems: number[][] = []
  const threat_dy = Math.sign(threat.end[0] - threat.begin[0])
  const threat_dx = Math.sign(threat.end[1] - threat.begin[1])
  for (let i = 0; i < threat.length; i++) {
    const r = threat.begin[0] + i * threat_dy
    const c = threat.begin[1] + i * threat_dx
    if (threat.pattern[i] !== "_") threatGems.push([r, c])
  }

  for (const shape of shapes) {
    if (shape.type !== "capture-threat" || shape.owner === threat.owner) continue

    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (const i of [1, 2]) {
      const r = shape.begin[0] + i * dy
      const c = shape.begin[1] + i * dx
      if (threatGems.some(gem => gem[0] === r && gem[1] === c)) {
        blockingCaptures.push(shape)
        break
      }
    }
  }
  return blockingCaptures
}


export function canBlockAllPenteThreats(game: GameState, threats: LinearShape[]): boolean {
  // function to check whether placing a gem can block all the pente threats
  // a threat can be blocked by placing a gem within it, or by capturing one of its gems

  if (threats.length === 0) return true

  let blockSpot: string = ""
  let normalBlockWorks = true

  for (const threat of threats) {
    const dy = Math.sign(threat.end[0] - threat.begin[0])
    const dx = Math.sign(threat.end[1] - threat.begin[1])
    for (let i = 0; i < threat.length; i++) {
      const r = threat.begin[0] + i * dy
      const c = threat.begin[1] + i * dx
      if (threat.pattern[i] === "_") {
        const s = r + "," + c
        if (blockSpot === "") blockSpot = s  // if first spot we need to block, write it down
        else if (blockSpot !== s) {  // if we found a second, different spot we need to block, can't do both at once
          normalBlockWorks = false
          break
        }
      }
    }
    if (!normalBlockWorks) break
  }

  if (normalBlockWorks) return true
  // otherwise, try blocking by capturing from all the threats

  let capturesBlockingAll = getBlockingCaptures(game.linearShapes, threats[0])
  for (let i = 1; i < threats.length; i++) {
    const captureHashSet = new Set(getBlockingCaptures(game.linearShapes, threats[i]).map(s => s.hash))
    capturesBlockingAll = capturesBlockingAll.filter(s => captureHashSet.has(s.hash))
  }
  if (capturesBlockingAll.length === 0) return false
  return true
}