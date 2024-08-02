import { Game, SearchResult, LinearShape } from "./model";
import { makeMove, undoMove, copyGame } from "./game"
import { generateOrderedMoves } from "./move_generation";
import { transpositionTable, transpositionTableSet, TTableKey } from "./ttable";


let normalNodesVisited: i32 = 0
let confirmAlpha: i32 = 0
let failHigh: i32 = 0
let ttableHit: i32 = 0
let ttableMiss: i32 = 0
let nMovesGenerated: i32[] = []

let killerMoves: Map<i32, i32[][]> = new Map()  // indexed by: ply, then move -> [r,c]
// will only store at most 2 killer moves per ply, as recommended by wikipedia, to keep them recent / relevant
function addKillerMove(r: i32, c: i32, ply: i32): void {
  let moves: i32[][] = []
  if (killerMoves.has(ply)) moves = killerMoves.get(ply)
  // make sure it's a new move
  for (let i = 0; i < moves.length; i++) {
    const m: i32[] = moves[i]
    if (m[0] === r && m[1] === c) return
  }
  moves.unshift([r, c])
  if (moves.length >= 2) moves.splice(2)
  killerMoves.set(ply, moves)
}


export function findBestMove(game: Game, maxDepth: number, absoluteEval: boolean = false): SearchResult {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search
  // if absoluteEval is true, return positive eval if 1st player winning, negative if 2nd player winning (otherwise positive means current player winning)

  game = copyGame(game)  // don't mutate the input

  let prevDepthResults: SearchResult[] = []

  for (let depth = 1; depth <= maxDepth; depth++) {
    console.log(`searching depth ${depth}...`)

    killerMoves.clear()

    normalNodesVisited = 0
    confirmAlpha = 0
    failHigh = 0
    ttableHit = 0
    ttableMiss = 0
    nMovesGenerated = []

    const principalVariation = prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : []
    const results = principalVariationSearch(game, depth, 1, -Infinity, Infinity, false, principalVariation, prevDepthResults, true)  // start alpha and beta at worst possible scores, and return results for all moves
    prevDepthResults = results

    // log results
    console.log(normalNodesVisited.toString() + " normal nodes visited")
    console.log("confirm alpha " + confirmAlpha.toString() + ", fail high " + failHigh.toString())
    console.log("ttable hit " + ttableHit.toString() + ", ttable miss " + ttableMiss.toString())
    console.log((nMovesGenerated.reduce((sum, x) => sum + x, 0) / nMovesGenerated.length).toString() + " moves generated on average")
    results.slice(0).forEach((r: SearchResult) => {
      const flagChar = r.evalFlag === "exact" ? "=" : r.evalFlag === "upper-bound" ? "≤" : "≥"
      console.log(["eval", flagChar, r.eval.toString(), r.bestVariation.map((m: i32[]) => `[${m[0].toString()},${m[1].toString()}]`).join()].join(" "))
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
  return prevDepthResults[0]
}



function principalVariationSearch(
  game: Game, depth: i32, ply: i32, alpha: f64, beta: f64, usingNullWindow: boolean, principalVariation: i32[][] = [], prevDepthResults: SearchResult[] = [], returnAllMoveResults: boolean = false)
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

  console.log([normalNodesVisited.toString(), depth.toString(), alpha.toString(), beta.toString()].join())
  console.log("memory: " + memory.size().toString())

  // leaf node base cases
  const evaluation = evaluatePosition(game)
  if (game.isOver || depth <= 0 || (ply > 1 && Math.abs(evaluation) === Infinity)) {  // need to check ply if we evaluate forcing win/loss, so that we will actually generate some move
    return [{ eval: evaluation, evalFlag: "exact", bestVariation: [] }]
  }

  const alphaOrig = alpha  // we need this in order to correctly set transposition table flags, but I'm unclear for sure why
  const allMoveResults: SearchResult[] = []
  let bestResult: SearchResult = { eval: -Infinity, evalFlag: "exact", bestVariation: [] }  // start with worst possible eval

  // transposition table cutoff / info
  const tableKey = TTableKey(game)
  const tableEntry = transpositionTable.has(tableKey) ? transpositionTable.get(TTableKey(game)) : null
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

  const killerMovesAtPly = killerMoves.has(ply) ? killerMoves.get(ply) : []
  const pvMove = principalVariation.length > 0 ? principalVariation[0] : []
  const moves: i32[][] = generateOrderedMoves(game, pvMove, tableEntry, killerMovesAtPly, prevDepthResults)

  let moveIndex = 0  // declare in this scope so we can collect this value once the for loop exits
  for (; moveIndex < moves.length && moveIndex <= 15; moveIndex++) {  // limit number of moves considered
    const r = moves[moveIndex][0]
    const c = moves[moveIndex][1]

    // search child
    makeMove(game, r, c)
    const restOfPrincipalVariation = principalVariation.slice(1)

    let childResult: SearchResult
    // do full search on the principal variation move, which is probably good
    if (moveIndex == 0) childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, usingNullWindow, restOfPrincipalVariation)[0]
    else {
      // not first-ordered move, so probably worse, do a fast null window search
      let searchDepth = (depth >= 3 && moveIndex >= 5) ? depth - 2 : depth - 1  // apply late move reduction
      childResult = principalVariationSearch(game, searchDepth, ply + 1, -alpha - 1, -alpha, true, restOfPrincipalVariation)[0]  // technically no longer the principal variation, but PV moves are probably still good in other positions
      // if failed high (we found a way to do better), do a full search
      // need to check equal to as well as the inequalities, because if the null window was -Infinity, -Infinity, any move will cause a cutoff by being equal to -Infinity
      // beta - alpha > 1 avoids a redundant null window search
      if (alpha <= -childResult.eval && -childResult.eval <= beta && beta - alpha > 1) {
        failHigh++
        childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, false, restOfPrincipalVariation)[0]
      }
      else {
        confirmAlpha++
      }
    }
    undoMove(game)

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const moveSequence: i32[][] = [[r, c]].concat(childResult.bestVariation)
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: (childResult.evalFlag === "lower-bound") ? "upper-bound" : (childResult.evalFlag === "upper-bound") ? "lower-bound" : "exact",
      bestVariation: moveSequence
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
  }
  nMovesGenerated.push(moveIndex)

  if (bestResult.eval <= alphaOrig) bestResult.evalFlag = bestResult.eval === -Infinity ? "exact" : "upper-bound"
  else if (bestResult.eval >= beta) bestResult.evalFlag = bestResult.eval === Infinity ? "exact" : "lower-bound"
  else bestResult.evalFlag = "exact"

  // store in transposition table if not null window (null window used an incorrect assumption, so the conclusion)
  if (!usingNullWindow) transpositionTableSet(game, bestResult, depth)

  // return
  if (returnAllMoveResults) {
    allMoveResults.sort((a: SearchResult, b: SearchResult) => {
      if (a.evalFlag === "exact" && b.evalFlag !== "exact") return -1
      if (b.evalFlag === "exact" && a.evalFlag !== "exact") return 1
      return i32(Math.sign(b.eval - a.eval))
    })
    return allMoveResults
  }
  return [bestResult]
}



// below, higher eval is better for player owning this shape
const shapeEvalMap: Map<string, f64> = new Map()
shapeEvalMap.set("open-tessera", 10000)
shapeEvalMap.set("open-tria", 35)
shapeEvalMap.set("stretch-tria", 30)  // btw, the open pair is counted separately
shapeEvalMap.set("open-pair", -5)
shapeEvalMap.set("pente-threat-4", 45)
shapeEvalMap.set("pente-threat-31", 45)
shapeEvalMap.set("pente-threat-22", 45)
shapeEvalMap.set("capture-threat", 10)  // compare with open pair (should be better to threaten), and with capture reward (should be more)
shapeEvalMap.set("stretch-two", 10)
shapeEvalMap.set("double-stretch-two", 7)



export function evaluatePosition(game: Game): f64 {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // because we used negamax for the search function, a higher evaluation is better for the current player, regardless of who that is

  // check for won / forced winning position - worth expending some effort into this, because it allows the search tree to stop earlier

  if (game.isOver) {
    // player who just moved won (not current player)
    return -Infinity
  }
  // if current player has a pente threat, they've won
  if (shapeExists(game, ["pente-threat-4", "pente-threat-31", "pente-threat-22"], true)) {
    return Infinity
  }
  // if current player can complete 5 captures, they've won
  if (game.captures[game.currentPlayer] >= 4 && shapeExists(game, ["capture-threat"], true)) {
    return Infinity
  }
  // we now establish that we can't win immediately on our turn
  // if opponent has multiple pente threats, check if we can block them all - this includes open tesseras, which are recognized as 2 pente threats
  const opponentPenteThreats: LinearShape[] = []
  for (let i = 0; i < game.linearShapes.length; i++) {
    const shape = game.linearShapes[i]
    if (shape.owner !== game.currentPlayer && shape.type.includes("pente-threat")) {
      opponentPenteThreats.push(shape)
    }
  }
  if (!canBlockAllPenteThreats(game, opponentPenteThreats)) return -Infinity

  // get evaluation from linear shapes

  // go through shapes and count trias, as well as sum up individual shape eval
  let shapeEval: f64 = 0
  let triaCountMe: i32 = 0
  let triaCountOpponent: i32 = 0
  for (let i = 0; i < game.linearShapes.length; i++) {
    const shape = game.linearShapes[i]
    if (["open-tria", "stretch-tria"].includes(shape.type)) {
      shape.owner === game.currentPlayer ? triaCountMe++ : triaCountOpponent++
    }
    if (shapeEvalMap.has(shape.type)) {
      shapeEval += (shape.owner === game.currentPlayer ? shapeEvalMap.get(shape.type) : -shapeEvalMap.get(shape.type))
    }
  }

  // if someone has a double tria, that's essentially an open tessera if not cleverly stopped, score highly
  // if both people have a double tria, it's my move, so I can take advantage of it first and I get the bonus
  const doubleTriaEval: f64 = 5000
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
  let initiativeSign: f64 = 0
  if (shapeExists(game, ["pente-threat-4", "pente-threat-31", "pente-threat-22"], false)) {
    // note: I don't have a pente threat b/c would have been caught higher up
    initiativeSign = -1  // opponent
  }
  else if (triaCountOpponent > 0 && triaCountMe === 0) {
    initiativeSign = -1
  }
  else if (shapeExists(game, ["capture-threat"], false) && !shapeExists(game, ["capture-threat"], true)) {
    initiativeSign = -1
  }
  else if (shapeExists(game, ["open-pair", "stretch-two", "double-stretch-two"], true)) {
    initiativeSign = 1
  }
  else if (shapeExists(game, ["open-pair"], false)) {
    initiativeSign = 1
  }
  const initiativeEval: f64 = initiativeSign * 30

  // console.log("initiative", initiativeSign)


  // capture eval
  // TODO - 0 vs 1 capture is not quite as big a difference as 3 vs 4 captures
  const captureEval: f64 = 30 * f64(game.captures[game.currentPlayer] - game.captures[game.currentPlayer === 0 ? 1 : 0])

  const currentPlayerBias: f64 = 15  // the current player has a bit of advantage from it being their turn, also helps reduce evaluation flip-flop depending on depth parity

  return shapeEval + initiativeEval + captureEval + currentPlayerBias
}


function shapeExists(game: Game, shapeTypes: string[], currentPlayerOwns: boolean): boolean {
  for (let i = 0; i < game.linearShapes.length; i++) {
    const shape = game.linearShapes[i]
    if (shape.owner === game.currentPlayer && currentPlayerOwns && shapeTypes.includes(shape.type)) {
      return true
    }
    else if (shape.owner !== game.currentPlayer && !currentPlayerOwns && shapeTypes.includes(shape.type)) {
      return true
    }
  }
  return false
}




export function getBlockingCaptures(shapes: LinearShape[], threat: LinearShape): LinearShape[] {
  const blockingCaptures: LinearShape[] = []

  // figure out where the threat's gems are
  const threatGems: number[][] = []
  const threat_dy = Math.sign(threat.end[0] - threat.begin[0])
  const threat_dx = Math.sign(threat.end[1] - threat.begin[1])
  for (let i = 0; i < threat.length; i++) {
    const r = threat.begin[0] + i * threat_dy
    const c = threat.begin[1] + i * threat_dx
    if (threat.pattern.charAt(i) !== "_") threatGems.push([r, c])
  }

  // go through the capture threats and see if any involve a gem from the threat
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i]
    if (shape.type !== "capture-threat" || shape.owner === threat.owner) continue

    let captureDoesBlock = false

    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    // loop through the two gems that will be captured, check if they coincide with a threat gem
    for (let i = 1; i <= 2; i++) {
      const r = shape.begin[0] + i * dy
      const c = shape.begin[1] + i * dx
      for (let g = 0; g < threatGems.length; g++) {
        if (threatGems[g][0] === r && threatGems[g][1] === c) {
          blockingCaptures.push(shape)
          captureDoesBlock = true
          break
        }
      }
      if (captureDoesBlock) break
    }
  }
  return blockingCaptures
}


export function canBlockAllPenteThreats(game: Game, threats: LinearShape[]): boolean {
  // function to check whether placing a gem can block all the pente threats
  // a threat can be blocked by placing a gem within it, or by capturing one of its gems

  if (threats.length === 0) return true

  let blockSpot: string = ""
  let normalBlockWorks = true

  for (let t = 0; t < threats.length; t++) {
    const threat = threats[t]
    const dy = Math.sign(threat.end[0] - threat.begin[0])
    const dx = Math.sign(threat.end[1] - threat.begin[1])
    for (let i = 0; i < threat.length; i++) {
      const r = threat.begin[0] + i * dy
      const c = threat.begin[1] + i * dx
      if (threat.pattern.charAt(i) === "_") {
        const s = r.toString() + "," + c.toString()
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

  let capturesBlockingAll: LinearShape[] = getBlockingCaptures(game.linearShapes, threats[0])
  for (let i = 1; i < threats.length; i++) {
    // get captures blocking this threat
    const blockingCaptureHashes: string[] = getBlockingCaptures(game.linearShapes, threats[i]).map((s: LinearShape) => s.hash)
    // remove any captures from capturesBlockingAll that fail to block this threat
    const filteredCapturesBlockingAll: LinearShape[] = []
    for (let j = 0; j < capturesBlockingAll.length; j++) {
      if (blockingCaptureHashes.includes(capturesBlockingAll[j].hash)) {
        filteredCapturesBlockingAll.push(capturesBlockingAll[j])
      }
    }
    capturesBlockingAll = filteredCapturesBlockingAll
  }
  if (capturesBlockingAll.length === 0) return false
  return true
}