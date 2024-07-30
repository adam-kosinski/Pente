import { makeMove, undoMove, type GameState, type SearchResult, type EvalFlag, type LinearShape } from "./model_v12";
import { type TTEntry, transpositionTable, transpositionTableSet, TTableKey } from "./ttable_v12";

let normalNodesVisited = 0
let quiescentNodesVisited = 0
let confirmAlpha = 0
let failHigh = 0
let ttableHit = 0
let ttableMiss = 0

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


export function findBestMove(game: GameState, absoluteEval: boolean = false): SearchResult {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search
  // if absoluteEval is true, return positive eval if 1st player winning, negative if 2nd player winning (otherwise positive means current player winning)

  game = copyGame(game)

  let prevDepthResults: SearchResult[] = []

  for (let depth = 1; depth <= 5; depth++) {
    console.log(`searching depth ${depth}...`)

    killerMoves = []

    normalNodesVisited = 0
    quiescentNodesVisited = 0
    confirmAlpha = 0
    failHigh = 0
    ttableHit = 0
    ttableMiss = 0

    const principalVariation = prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : []
    const results = principalVariationSearch(game, depth, 1, -Infinity, Infinity, false, principalVariation, prevDepthResults, true)  // start alpha and beta at worst possible scores, and return results for all moves
    prevDepthResults = results

    // log results
    console.log(normalNodesVisited + " normal nodes visited")
    console.log(quiescentNodesVisited + " quiescent nodes visited")
    console.log("confirm alpha", confirmAlpha, "fail high", failHigh)
    console.log("ttable hit", ttableHit, "ttable miss", ttableMiss)
    results.slice(0).forEach(r => {
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
  return prevDepthResults[0]
}



function principalVariationSearch(
  game: GameState, depth: number, ply: number, alpha: number, beta: number, isQuiescent: boolean, principalVariation: number[][] = [], prevDepthResults: SearchResult[] = [], returnAllMoveResults: boolean = false)
  : SearchResult[] {
  // returns a list of evaluations for either just the best move, or all moves (if all moves, it will be sorted with best moves first)
  // note that the evaluation is from the current player's perspective (higher better)

  // ply counts how deep into the search tree we are so far; depth is how much we have left to go and b/c of late move reductions isn't a good measure of how deep we've gone
  // alpha and beta are used for alpha-beta pruning
  // isQuiescent is whether we are currently doing quiescence search
  // principalVariation is the remainder of the principal variation from the previous iteration of iterative deepening
  // - the first move in this variation is always searched first and at full depth
  // prevDepthResults (optional): results from previous iteration of iterative deepening, will be used to help order moves
  // returnAllMoveResults is useful for debugging

  isQuiescent ? quiescentNodesVisited++ : normalNodesVisited++

  // leaf node base cases
  if (game.isOver) {
    return [{ eval: evaluatePosition(game), evalFlag: "exact", bestVariation: [] }]
  }
  if (depth === 0) {
    if (isQuiescent) return [{ eval: evaluatePosition(game), evalFlag: "exact", bestVariation: [] }]
    // else do quiescent search with some reasonable max depth
    else return principalVariationSearch(game, 10, ply, alpha, beta, true, principalVariation) // no move has been made so don't negate
  }
  let nonQuietMoves: number[][] = []  // declare out here so we can use it later if needed
  if (isQuiescent) {
    nonQuietMoves = getNonQuietMoves(game)
    // if reached quiet node in quiescent search, we're done
    if (nonQuietMoves.length === 0) return [{ eval: evaluatePosition(game), evalFlag: "exact", bestVariation: [] }]
  }

  const alphaOrig = alpha  // we need this in order to correctly set transposition table flags, but I'm unclear for sure why

  // transposition table cutoff / info
  const tableEntry = transpositionTable.get(TTableKey(game))
  if (tableEntry && tableEntry.depth >= depth && tableEntry.fromQuiescentSearch === isQuiescent) {
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

  // quiescent standing pat - helps prune away some of the quiescent search
  // if the evaluation already exceeds beta, prune (basically assume the evaluation is good enough to approximate alpha)
  if (isQuiescent) {
    const evaluation = evaluatePosition(game)
    if (evaluation >= beta && !returnAllMoveResults) {
      return [{ eval: evaluation, evalFlag: "lower-bound", bestVariation: [] }]
    }
  }

  const allMoveResults: SearchResult[] = []
  let bestResult: SearchResult = { eval: -Infinity, evalFlag: "exact", bestVariation: [] }  // start with worst possible eval

  let moveIndex = 0
  const moveIterator = isQuiescent ? nonQuietMoves : makeOrderedMoveIterator(game, ply, principalVariation[0], tableEntry, prevDepthResults)
  for (const [r, c] of moveIterator) {
    // search child
    makeMove(game, r, c)
    const restOfPrincipalVariation = principalVariation.slice(1)

    let childResult: SearchResult
    // do full search on the principal variation move, which is probably good
    if (moveIndex == 0) childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, isQuiescent, restOfPrincipalVariation)[0]
    else {
      // not first-ordered move, so probably worse, do a fast null window search
      let searchDepth = (depth >= 3 && moveIndex >= 3) ? depth - 2 : depth - 1  // apply late move reduction
      childResult = principalVariationSearch(game, searchDepth, ply + 1, -alpha - 1, -alpha, isQuiescent, restOfPrincipalVariation)[0]  // technically no longer the principal variation, but PV moves are probably still good in other positions
      // if failed high (we found a way to do better), do a full search
      // beta - alpha > 1 avoids a redundant null window search
      if (-childResult.eval > alpha && beta - alpha > 1) {
        failHigh++
        childResult = principalVariationSearch(game, depth - 1, ply + 1, -beta, -alpha, isQuiescent, restOfPrincipalVariation)[0]
      }
      else {
        confirmAlpha++
      }
    }
    undoMove(game)

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: childResult.evalFlag === "lower-bound" ? "upper-bound" : "upper-bound" ? "lower-bound" : "exact",
      bestVariation: [[r, c], ...childResult.bestVariation]
    }
    allMoveResults.push(myResult)

    // if no result recorded yet, ours is the best (important not to skip this, so that we end up with a meaningful variation)
    if (bestResult.bestVariation.length === 0) bestResult = myResult
    // use strict inequality for max, b/c we would like to retain the earlier (more sensible) moves
    if (myResult.eval > bestResult.eval && (myResult.evalFlag === "lower-bound" || myResult.evalFlag === "exact")) {
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

  if (bestResult.eval <= alphaOrig) bestResult.evalFlag = bestResult.eval === -Infinity ? "exact" : "upper-bound"
  else if (bestResult.eval >= beta) bestResult.evalFlag = bestResult.eval === Infinity ? "exact" : "lower-bound"
  else bestResult.evalFlag = "exact"

  transpositionTableSet(game, bestResult, depth, isQuiescent)

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
  "extendable-stretch-tria-threatened": 7,
  "extendable-tria": 8,
  "extendable-stretch-tria": 9,
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
    yield [center, center]
    return
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

  // rank by heuristics

  // TODO - if there is a pente threat, the only relevant move for the owner is completing it, and the only relevant moves for the opponent are within it or captures or completing their own pente

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
    else if (["extendable-tria", "extendable-stretch-tria", "extendable-stretch-tria-threatened"].includes(shape.type) && shape.owner === game.currentPlayer) {
      myExtendableTrias.push(shape)
    }
    else if (shape.type === "capture-threat" && shape.owner === game.currentPlayer) {
      myCaptureThreats.push(shape)
    }
  }

  let nonQuietShapes: LinearShape[] = []
  if (myPenteThreats.length > 0) nonQuietShapes = myPenteThreats
  else if (opponentPenteThreats.length > 0) nonQuietShapes = [...opponentPenteThreats, ...myCaptureThreats]
  else nonQuietShapes = [...myOpenTrias, ...myExtendableTrias, ...opponentOpenTrias, ...myCaptureThreats]

  // get moves from shapes - similar logic to the main move generator
  const moves = []

  // setup
  const moveHashes = new Set()  // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const isValidMove = function (move: number[]) {
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
    "open-tria": 35,
    "stretch-tria": 25,
    "open-pair": -5,
    "pente-threat-4": 15,  // pente threats aren't marked as super good in a vaccuum b/c often they are good tactically
    "pente-threat-31": 15,
    "pente-threat-22": 15,  // if pairs are vulnerable, the open-pair penalty will apply
    "capture-threat": 10, // compare with open pair (should be better to threaten), and with capture reward (should be more)
    "extendable-stretch-tria-threatened": -10,  // recognized instead of capture threat so give it capture threat score
    "stretch-two": 10
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
  const captureEval = 20 * (game.captures[game.currentPlayer] - game.captures[Number(!game.currentPlayer) as 0 | 1])

  return shapeEval + initiativeEval + captureEval
}





// if we ever need to find all linear shapes, can just use the updateLinearShapes function on the places
// that have stones