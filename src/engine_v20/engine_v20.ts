import {
  gameToString,
  makeMove,
  undoMove,
  copyGame,
  type GameState,
  type SearchResult,
  type EvalFlag,
} from "./model_v20";
import { makeOrderedMoveIterator } from "./move_generation_v20";
import {
  transpositionTable,
  transpositionTableSet,
  TTableKey,
} from "./ttable_v20";
import { evaluatePosition } from "./evaluation_v20";

let nodesVisited = 0;
let confirmAlpha = 0;
let failHigh = 0;
let ttableHit = 0;
let ttableMiss = 0;
let nMovesGenerated: number[] = [];

let killerMoves: number[][][] = []; // indexed by: ply, then move -> [r,c]
// will only store at most 2 killer moves per ply, as recommended by wikipedia, to keep them recent / relevant
function addKillerMove(r: number, c: number, ply: number) {
  if (!killerMoves[ply]) killerMoves[ply] = [];
  // make sure it's a new move
  for (const m of killerMoves[ply]) {
    if (m[0] === r && m[1] === c) return;
  }
  killerMoves[ply].unshift([r, c]);
  if (killerMoves[ply].length >= 2) killerMoves[ply].splice(2);
}

export function softmax(z: number[], b = 1) {
  // 0 < b < 1 results in smoother distribution
  // b > 1 results in sharper distribution
  const out = [];
  let expSum = 0;
  for (const zj of z) {
    expSum += Math.exp(b * zj);
  }
  return z.map((zi) => Math.exp(b * zi) / expSum);
}

function chooseFromWeights(weights: number[]): number {
  if (Math.abs(weights.reduce((sum, x) => sum + x) - 1) > 0.001) {
    console.error("weights don't add to 1");
  }
  let cumSum = 0;
  const cumWeights = weights.map((w) => (cumSum += w));
  const rand = Math.random();
  for (let i = 0; i < cumWeights.length; i++) {
    if (rand <= cumWeights[i]) return i;
  }
  return 0; // just in case
}

function flipEvalFlag(flag: EvalFlag) {
  if (flag === "lower-bound") return "upper-bound";
  if (flag === "upper-bound") return "lower-bound";
  return flag;
}

export function chooseMove(
  game: GameState,
  maxDepth: number,
  maxMs: number = Infinity,
  verbose: boolean = true
): number[] {
  // in the opening, look into several variations and choose one randomly, weighted by how good it is
  if (game.nMoves < 6) {
    const nVariations = game.nMoves === 2 ? 4 : game.nMoves < 4 ? 3 : 2;
    const results = findBestMoves(
      game,
      nVariations,
      maxDepth,
      maxMs,
      false,
      verbose
    );
    const choiceProbs = softmax(
      results.map((r) => r.eval),
      0.3
    ); // bigger eval is better for me, will be chosen more likely
    const chosenIdx = chooseFromWeights(choiceProbs);
    return results[chosenIdx].bestVariation[0];
  }
  return findBestMoves(game, 1, maxDepth, maxMs, false, verbose)[0]
    .bestVariation[0];
}

export function findBestMoves(
  game: GameState,
  variations: number,
  maxDepth: number,
  maxMs = Infinity,
  absoluteEval = false,
  verbose = true,
  intermediateResultsCallback?: (results: SearchResult[]) => void
): SearchResult[] {
  // principal variation search aka negascout, with alpha beta pruning and iterative deepening
  // https://en.wikipedia.org/wiki/Principal_variation_search
  // if absoluteEval is true, return positive eval if player 0 winning, negative if player 1 winning (otherwise positive means current player winning)

  game = copyGame(game); // don't mess with the game object we got
  const flipEval = absoluteEval && game.currentPlayer === 1;

  const startTime = performance.now();
  const deadlineMs = performance.now() + maxMs;

  // make sure other variations aren't polluting this, fixes some buggy behavior
  // though why would clearing it matter, since in theory it's position -> result, and positions don't care where they came from
  transpositionTable.clear();

  let prevDepthResults: SearchResult[] = [];

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (verbose) console.log(`searching depth ${depth}...`);

    killerMoves = [];

    nodesVisited = 0;
    confirmAlpha = 0;
    failHigh = 0;
    ttableHit = 0;
    ttableMiss = 0;
    nMovesGenerated = [];

    const principalVariation =
      prevDepthResults.length > 0 ? prevDepthResults[0].bestVariation : [];
    const results = principalVariationSearch(
      game,
      depth,
      1,
      -Infinity,
      Infinity,
      deadlineMs,
      false,
      principalVariation,
      prevDepthResults,
      false,
      variations
    ); // start alpha and beta at worst possible scores, and return results for all moves

    if (results.length === 0) {
      // ran out of moves - shouldn't happen but might if I have a bug
      console.warn(
        `Searching depth ${depth} resulted in no results, will use what we have:`
      );
      console.log(JSON.stringify(prevDepthResults));
    }
    if (results[0] === undefined) {
      // shouldn't happen - but highlights bugs
      console.warn("undefined result", results);
    }

    prevDepthResults = results;

    // log results
    if (verbose) {
      console.log(nodesVisited + " nodes visited");
      console.log("confirm alpha", confirmAlpha, "fail high", failHigh);
      console.log("ttable hit", ttableHit, "ttable miss", ttableMiss);
      console.log(
        (
          nMovesGenerated.reduce((sum, x) => sum + x, 0) /
          nMovesGenerated.length
        ).toFixed(2),
        "moves generated on average"
      );
      let maxMovesGenerated = 0;
      for (const n of nMovesGenerated) {
        if (n > maxMovesGenerated) maxMovesGenerated = n;
      }
      console.log("max " + maxMovesGenerated + " moves generated");
      results.slice(0).forEach((r) => {
        const flagChar =
          r.evalFlag === "exact"
            ? "="
            : r.evalFlag === "upper-bound"
            ? "≤"
            : "≥";
        console.log(
          "eval",
          flagChar,
          r.eval.toFixed(2),
          JSON.stringify(r.bestVariation)
        );
      });
      console.log("");
    }

    // if ran out of time, stop looking
    if (performance.now() > deadlineMs) {
      if (verbose) console.log("ran out of time searching depth " + depth);
      if (prevDepthResults.length === 0) {
        // shouldn't happen (should always return something) but highlights bugs
        console.warn(
          "no answer returned because ran out of time on depth " + depth
        );
      }
      break;
    }

    // if found a forced win for either player, no need to keep looking
    if (Math.abs(results[0].eval) === Infinity) break;

    // send intermediate results if the caller provided a callback
    intermediateResultsCallback?.(
      prepResultsOutput(prevDepthResults, flipEval)
    );
  }

  if (prevDepthResults.length === 0) {
    console.warn("no prev results", prevDepthResults);
  }
  if (prevDepthResults[0] === undefined) {
    console.warn("undefined prev result", prevDepthResults);
  }

  if (verbose) {
    console.log("time taken", performance.now() - startTime);
    console.log("---------------------");
  }

  return prepResultsOutput(prevDepthResults, flipEval);
}

function prepResultsOutput(results: SearchResult[], flipEval: boolean) {
  const output = results.map((r) => {
    // make a shallow copy so flipping the eval doesn't mess with future searches,
    // since results gets passed to the next iteration of iterative deepening
    const copy = { ...r };
    if (flipEval) {
      // flip eval sign
      copy.eval = -copy.eval;
      copy.evalFlag = flipEvalFlag(copy.evalFlag);
    }
    return copy;
  });
  return output;
}

function principalVariationSearch(
  game: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  deadlineMs: number, // performance.now() time we need to finish by
  usingNullWindow: boolean,
  principalVariation: number[][] = [],
  prevDepthResults: SearchResult[] = [],
  returnAllMoveResults: boolean = false,
  nVariations = 1
): SearchResult[] {
  // returns a list of evaluations for either just the best move, or all moves (if all moves, it will be sorted with best moves first)
  // note that the evaluation is from the current player's perspective (higher better)

  // ply counts how deep into the search tree we are so far; depth is how much we have left to go and b/c of late move reductions isn't a good measure of how deep we've gone
  // alpha and beta are used for alpha-beta pruning
  // principalVariation is the remainder of the principal variation from the previous iteration of iterative deepening
  // - the first move in this variation is always searched first and at full depth
  // prevDepthResults (optional): results from previous iteration of iterative deepening, will be used to help order moves
  // returnAllMoveResults is useful for debugging

  nodesVisited++;

  // ran out of time base case - don't allow for original depth 1 search because need to return something
  if (performance.now() > deadlineMs && !(ply === 1 && depth === 1)) {
    // return result indicating ran out of time, eval 0 is arbitrary
    return [
      { eval: 0, evalFlag: "exact", bestVariation: [], ranOutOfTime: true },
    ];
  }

  // leaf node base cases
  const staticEval = evaluatePosition(game);
  if (
    game.isOver ||
    depth === 0 ||
    (Math.abs(staticEval) === Infinity && ply > 1)
  ) {
    // need to check ply > 1 if we evaluate forcing win/loss, so that we will actually generate some move
    return [
      {
        eval: staticEval,
        evalFlag: "exact",
        bestVariation: [],
        ranOutOfTime: false,
      },
    ];
  }

  const alphaOrig = alpha; // we need this in order to correctly set transposition table flags, but I'm unclear for sure why
  const allMoveResults: SearchResult[] = []; // all the results, used for debugging
  const bestVariations: SearchResult[] = []; // stores only the best several variations, as requested, kept sorted best first

  // check transposition table
  const tableKey = TTableKey(game, usingNullWindow);
  const tableEntry = transpositionTable.get(tableKey);
  if (tableEntry && tableEntry.depth >= depth) {
    ttableHit++;
    if (
      tableEntry.result.evalFlag === "exact" &&
      !returnAllMoveResults &&
      nVariations === 1
    ) {
      return [tableEntry.result];
    }
    // note - not sure if this clause will cause bugs with the new code for best variations, since alpha is conditioned on having found at least a certain number of variations
    //        so commenting out for now
    // else if (tableEntry.result.evalFlag === "lower-bound") {
    //   alpha = Math.max(alpha, tableEntry.result.eval);
    // }

    // this code seems to be incorrect because it leads to wrong evaluations of +Infinity when we are definitely losing
    // although maybe that was another transposition table bug (e.g. not clearing after each variation fixed some stuff?)
    // else if (tableEntry.result.evalFlag === "upper-bound") {
    //   beta = Math.min(beta, tableEntry.result.eval)
    // }
    // if (alpha >= beta && !returnAllMoveResults) {
    //   // cutoff
    //   return [tableEntry.result];
    // }
  } else {
    ttableMiss++;
  }

  // extend on forcing positions (pente threat or 5th capture threat), since branching
  // note that I won't have a pente or 5th capture threat (only the opponent will),
  // because if I did the eval function would have seen this and marked this position
  // as won for me (since I have a winning move)
  // don't extend on depth 1, because need to return something for the depth 1 iteration of iterative deepening,
  // and extensions might cause us to run out of time
  let extension = 0;
  if (depth > 1) {
    const fourOpponentCaptures =
      game.captures[Number(!game.currentPlayer) as 0 | 1] === 4;
    const penteThreatExists = game.linearShapes.some((shape) =>
      shape.type.includes("pente-threat")
    );
    if (
      penteThreatExists ||
      (fourOpponentCaptures &&
        game.linearShapes.some(
          (shape) =>
            shape.type === "capture-threat" &&
            shape.owner !== game.currentPlayer
        ))
    ) {
      extension = 1;
    }
  }

  let moveIndex = 0;
  const moveIterator = makeOrderedMoveIterator(
    game,
    ply,
    principalVariation[0],
    tableEntry,
    killerMoves,
    prevDepthResults
  );
  for (const [r, c] of moveIterator) {
    // search child
    makeMove(game, r, c);
    const restOfPrincipalVariation = principalVariation.slice(1);

    let childResult: SearchResult;
    // do full search on the principal variation move, which is probably good
    if (moveIndex == 0)
      childResult = principalVariationSearch(
        game,
        depth - 1 + extension,
        ply + 1,
        -beta,
        -alpha,
        deadlineMs,
        usingNullWindow,
        restOfPrincipalVariation
      )[0];
    else {
      // not first-ordered move, so probably worse, do a fast null window search
      let searchDepth = depth >= 3 && moveIndex >= 5 ? depth - 2 : depth - 1; // apply late move reduction
      searchDepth += extension;
      childResult = principalVariationSearch(
        game,
        searchDepth,
        ply + 1,
        -alpha - 1,
        -alpha,
        deadlineMs,
        true,
        restOfPrincipalVariation
      )[0]; // technically no longer the principal variation, but PV moves are probably still good in other positions

      // if failed high (we found a way to do better), do a full search
      // need to check equal to as well as the inequalities, because if the null window was -Infinity, -Infinity, any move will cause a cutoff by being equal to -Infinity
      // beta - alpha > 1 avoids a redundant null window search
      if (
        alpha <= -childResult.eval &&
        -childResult.eval <= beta &&
        beta - alpha > 1
      ) {
        failHigh++;
        childResult = principalVariationSearch(
          game,
          depth - 1,
          ply + 1,
          -beta,
          -alpha,
          deadlineMs,
          false,
          restOfPrincipalVariation
        )[0];
      } else {
        confirmAlpha++;
      }
    }
    undoMove(game);

    if (childResult.ranOutOfTime) {
      // If we've found moves already, return those.
      // This is safe even though we haven't looked at all reasonable moves yet, because we started
      //   by looking at the best move from the previous iteration of iterative deepening (principal variaiton),
      //   so we either don't change our answer or found a better move(can't be returning a worse move than the
      //   previous PV by doing this)
      // Also - these search results aren't flagged as ranOutOfTime aka invalid, but our parent
      //  function will realize we ran out of time the next time it calls a child and gets ranOutOfTime
      //  back immediately
      if (bestVariations.length > 0) {
        return bestVariations;
      }
      // if we didn't find moves yet, the best we can do is say we ran out of time and ignore the result
      return [childResult]; // return another dummy result indicating ran out of time
    }

    // get my move's result, including negating the eval and evalFlag from the child search b/c we are doing negamax
    const myResult: SearchResult = {
      eval: -childResult.eval,
      evalFlag: flipEvalFlag(childResult.evalFlag),
      bestVariation: [[r, c], ...childResult.bestVariation],
      ranOutOfTime: childResult.ranOutOfTime,
    };
    // upper bound of -Infinity is an exact eval, similar with Infinity
    if (
      (myResult.eval === -Infinity && myResult.evalFlag === "upper-bound") ||
      (myResult.eval === Infinity && myResult.evalFlag === "lower-bound")
    ) {
      myResult.evalFlag = "exact";
    }
    allMoveResults.push(myResult);

    // check if this result is one of the best variations
    // if not enough variations found, then this one is one, otherwise compare to the last aka worst result in bestVariations
    // upper bound results don't count (unless we have nothing), b/c for all we know they could be -Infinity
    if (
      bestVariations.length < nVariations ||
      (myResult.evalFlag !== "upper-bound" &&
        myResult.eval > bestVariations.slice(-1)[0].eval)
    ) {
      // I'm one of the best variations!
      bestVariations.push(myResult);
      // maintain ordering
      bestVariations.sort(searchResultComparator);
      // bring back down to max length = nVariations, by removing the worst variation
      bestVariations.splice(nVariations);
    }

    // alpha-beta pruning: if the opponent could force a worse position for us elsewhere in the tree (beta) than we could force here (best eval),
    // they would avoid coming here, so we can stop looking at this node
    // first check that this move can raise alpha (if upper bound, for all we know the true eval could be -Infinity)
    if (bestVariations[0].evalFlag !== "upper-bound") {
      // to ensure that we get correct exact evaluations for the number of variations we want (e.g. 3),
      // only update alpha to what the worst of the 3 best variations can achieve
      // if we don't have 3 variations yet, don't change alpha, don't want to exclude anything yet
      if (bestVariations.length === nVariations) {
        alpha = Math.max(alpha, bestVariations.slice(-1)[0].eval);
      }
      if (bestVariations[0].eval >= beta) {
        // killer move - you don't get to be a killer move for just being any move in a losing position
        if (
          bestVariations[0].eval !== -Infinity &&
          bestVariations[0] === myResult
        ) {
          addKillerMove(r, c, ply);
        }
        break;
      }
    }
    moveIndex++;

    // limit branching factor - NOTE: this causes embarassingly wrong evaluations sometimes
    // don't do this in the opening
    if (game.nMoves > 6 && moveIndex >= 20) break;
  }
  nMovesGenerated.push(moveIndex);

  if (bestVariations[0].eval <= alphaOrig)
    bestVariations[0].evalFlag =
      bestVariations[0].eval === -Infinity ? "exact" : "upper-bound";
  else if (bestVariations[0].eval >= beta)
    bestVariations[0].evalFlag =
      bestVariations[0].eval === Infinity ? "exact" : "lower-bound";
  else bestVariations[0].evalFlag = "exact";

  transpositionTableSet(tableKey, bestVariations[0], depth);

  if (allMoveResults.length === 0) {
    console.warn(`no moves found, depth: ${depth} and nMoves: ${game.nMoves}`);
  }

  // return
  if (returnAllMoveResults) {
    allMoveResults.sort(searchResultComparator);
    return allMoveResults;
  }
  return bestVariations;
}

function searchResultComparator(a: SearchResult, b: SearchResult): number {
  // exact evaluations beat upper bounds (if upper bound, true eval could be -Infinity)
  if (a.evalFlag === "exact" && b.evalFlag === "upper-bound") return -1;
  if (b.evalFlag === "exact" && a.evalFlag === "upper-bound") return 1;
  // lower bounds can beat exact evaluations, need to compare the eval
  return b.eval - a.eval;
}
