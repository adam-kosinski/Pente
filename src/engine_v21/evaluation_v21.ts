import {
  type GameState,
  gameToString,
  type LinearShape,
  linearShapeDef,
  makeMove,
  nonlinearShapeTypes,
  type Shape,
  undoMove,
} from "./model_v21";
import { makeOrderedMoveIterator } from "./move_generation_v21";
import { getMovesBlockingAllThreats, loc } from "./shape_utilities_v21";

export function evaluatePosition(game: GameState) {
  // evaluation of a static position based on heuristics (without looking ahead, that is the job of the search function)
  // because we used negamax for the search function, a higher evaluation is better for the current player, regardless of who that is

  // check for won / forced winning position - worth expending some effort into this, because it allows the search tree to stop earlier

  if (game.isOver) {
    // player who just moved won (not current player)
    return -Infinity;
  }
  // count up pente threats, only do this once for efficiency
  const opponentPenteThreats: LinearShape[] = [];
  for (const shape of game.linearShapes) {
    if (!shape.type.includes("pente-threat")) continue;
    if (shape.owner === game.currentPlayer) {
      // if current player has a pente threat, they've won
      return Infinity;
    } else {
      opponentPenteThreats.push(shape);
    }
  }
  // if current player can complete 5 captures, they've won
  if (
    game.captures[game.currentPlayer] >= 4 &&
    game.linearShapes.some(
      (shape) =>
        shape.type === "capture-threat" && shape.owner === game.currentPlayer
    )
  ) {
    return Infinity;
  }
  // we now establish that we can't win immediately on our turn
  // look for unstoppable opponent threats
  // if opponent has multiple pente threats, check if we can block them all
  if (
    opponentPenteThreats.length > 0 &&
    getMovesBlockingAllThreats(game, opponentPenteThreats).length === 0
  ) {
    return -Infinity;
  }

  // use position feature dict along with weights and bias to compute evaluation
  const featureDict = positionFeatureDict(game);
  const openingWeight = Math.max(
    0,
    Math.min(1, 0.5 + (openingIdx - game.nMoves) / blendRange)
  );
  // init eval as the intercept, and then add in features * weights
  let evaluation =
    openingCurrentPlayerBias * openingWeight +
    laterCurrentPlayerBias * (1 - openingWeight);
  for (const key in featureDict) {
    evaluation +=
      featureDict[key] *
      ((openingFeatureWeights[key] || 0) * openingWeight +
        (laterFeatureWeights[key] || 0) * (1 - openingWeight));
  }
  return 10 * evaluation; // arbitrary scaling
}

const openingIdx = 8;
const blendRange = 6;

const openingFeatureWeights: Record<string, number> = {
  "opp-open-tessera": 0.0,
  "opp-pente-threat-4": -1.2575924455020684,
  "opp-pente-threat-31": -1.1689051234685441,
  "opp-pente-threat-22": 0.0,
  "my-open-tria": 0.7119438888024766,
  "opp-open-tria": -1.884903479506673,
  "my-stretch-tria": 0.0,
  "opp-stretch-tria": -0.22984650076316065,
  "my-open-pair": 0.6283071743223806,
  "opp-open-pair": -0.13147982367430314,
  "my-capture-threat": 1.1500917928181478,
  "opp-capture-threat": -0.4926356843745724,
  "my-stretch-two": 0.9723202979697178,
  "opp-stretch-two": -0.6528458464644293,
  "my-pente-potential-1": 0.6431270361217074,
  "opp-pente-potential-1": -0.22702727632023764,
  "my-captures": 0.6178227521530552,
  "opp-captures": -1.0510941247084822,
  "my-4-captures": 0.0,
  "opp-4-captures": 0.0,
  "my-actionable-threats": 1.0242887426180547,
};
const openingCurrentPlayerBias = 0.1058091902070305;

const laterFeatureWeights: Record<string, number> = {
  "opp-open-tessera": -1.7410874782138606,
  "opp-pente-threat-4": -1.3748817523709218,
  "opp-pente-threat-31": -1.2964364039592975,
  "opp-pente-threat-22": -0.9546274769104228,
  "my-open-tria": 1.2820589155134834,
  "opp-open-tria": -1.4727470488838141,
  "my-stretch-tria": 0.9288370619029538,
  "opp-stretch-tria": -0.6923139173185503,
  "my-open-pair": 0.19314421111377442,
  "opp-open-pair": -0.09925769288681408,
  "my-capture-threat": 0.7625062333626407,
  "opp-capture-threat": -0.6296434148860676,
  "my-stretch-two": 0.27231290775330663,
  "opp-stretch-two": -0.23644139829275285,
  "my-pente-potential-1": 0.620924174297079,
  "opp-pente-potential-1": -0.47750877692025884,
  "my-captures": 0.9646834610025018,
  "opp-captures": -0.9372353989452303,
  "my-4-captures": 0.31400652184803785,
  "opp-4-captures": -0.9861262876253569,
  "my-actionable-threats": 0.5166803568177883,
};
const laterCurrentPlayerBias = 0.3454197109825302;
// some shapes aren't useful for evaluation, but are still used for move ordering
const shapesToExclude = [
  "double-stretch-two",
  "pente-potential-2",
  "extendable-tria",
  "extendable-stretch-tria-1",
  "extendable-stretch-tria-2",
  "three-gap",
  "three",
  "blocked-pente-4",
  "blocked-pente-31",
  "blocked-pente-22",
];

function sum(array: number[]) {
  return array.reduce((total, current) => total + current, 0);
}

export function positionFeatureDict(game: GameState): Record<string, number> {
  // returns an object of useful information for evaluating the position

  // init feature dict with all possible fields
  const featureDict: Record<string, number> = {};
  for (const shapeType in linearShapeDef) {
    if (shapeType === "pente") continue; // not helpful, we already know who won if we find this
    if (shapesToExclude.includes(shapeType)) continue;
    if (!shapeType.includes("pente-threat") && shapeType !== "open-tessera") {
      featureDict["my-" + shapeType] = 0;
    }
    featureDict["opp-" + shapeType] = 0;
  }
  // for(const shapeType of nonlinearShapeTypes) {
  //   featureDict[shapeType] = 0
  // }
  featureDict["my-captures"] = game.captures[game.currentPlayer];
  featureDict["opp-captures"] =
    game.captures[Number(!game.currentPlayer) as 0 | 1];
  featureDict["my-4-captures"] = Number(featureDict["my-captures"] === 4);
  featureDict["opp-4-captures"] = Number(featureDict["opp-captures"] === 4);
  // featureDict["can-block-trias"] = 0;
  featureDict["move-index"] = game.nMoves;
  featureDict["my-actionable-threats"] = 0;
  // featureDict["not-in-shape"] = 0;
  // featureDict["momentum"] = evaluateMomentum(game, 6);
  // const myThreatHistory = game.threatHistory.filter(
  //   (value, index) => (index + Number(!game.currentPlayer)) % 2
  // );
  // const oppThreatHistory = game.threatHistory.filter(
  //   (value, index) => (index + Number(game.currentPlayer)) % 2
  // );
  // featureDict["my-threat-history"] = sum(myThreatHistory) / game.nMoves;
  // featureDict["opp-threat-history"] = sum(oppThreatHistory) / game.nMoves;
  // featureDict["my-threat-history-4"] = sum(myThreatHistory.slice(-4));
  // featureDict["opp-threat-history-4"] = sum(oppThreatHistory.slice(-4));

  // count linear shapes, for me (current player) and for the opponent
  let myThreatScore = 0; // keep track of forcing threats I can make, which we will count if the opponent doesn't have pente threats
  const opponentTrias: LinearShape[] = [];
  let opponentPenteThreats: LinearShape[] = [];
  for (const shape of game.linearShapes) {
    if (shape.type === "pente") continue; // not helpful, we already know who won if we find this
    // count me minus opponent
    if (!shapesToExclude.includes(shape.type)) {
      if (
        shape.owner === game.currentPlayer &&
        !shape.type.includes("pente-threat") &&
        shape.type !== "open-tessera"
      ) {
        featureDict["my-" + shape.type]++;
      } else {
        featureDict["opp-" + shape.type]++;
      }
    }
    // count trias
    if (["open-tria", "stretch-tria"].includes(shape.type)) {
      if (shape.owner === game.currentPlayer) myThreatScore += 2;
      else opponentTrias.push(shape);
    }
    // count my extendable trias
    if (
      shape.type.includes("extendable-tria") &&
      shape.owner === game.currentPlayer
    ) {
      myThreatScore += 1;
    }
    // check for opponent pente threat
    if (
      shape.type.includes("pente-threat") &&
      shape.owner !== game.currentPlayer
    ) {
      opponentPenteThreats.push(shape);
    }
  }

  if (opponentPenteThreats.length === 0) {
    featureDict["my-actionable-threats"] = myThreatScore;
  }

  // count nonlinear shapes
  // for(const shape of getNonlinearShapes(game)){
  //   featureDict[shape.type] += shape.owner === game.currentPlayer ? 1 : -1
  // }

  // see if we can block all opponent trias (in addition to pente threats, which are more forcing)
  // NOTE - copy pente threat format above if we bring this idea back

  // count number of gems in a linear shape, for each player
  // const gemLocations0 = new Set<string>();
  // const gemLocations1 = new Set<string>();
  // for (const shape of game.linearShapes) {
  //   for (let i = 0; i < shape.length; i++) {
  //     if (shape.pattern.charAt(i) === "0") {
  //       gemLocations0.add(loc(shape, i));
  //     } else if (shape.pattern.charAt(i) === "1") {
  //       gemLocations1.add(loc(shape, i));
  //     }
  //   }
  // }
  // const gemsPlaced0 = Math.ceil(game.nMoves / 2);
  // const gemsCaptured0 = game.captures[1] * 2;
  // const nGems0 = gemsPlaced0 - gemsCaptured0;
  // const nGemsNotInShape0 = nGems0 - gemLocations0.size;

  // const gemsPlaced1 = Math.floor(game.nMoves / 2);
  // const gemsCaptured1 = game.captures[0] * 2;
  // const nGems1 = gemsPlaced1 - gemsCaptured1;
  // const nGemsNotInShape1 = nGems1 - gemLocations1.size;

  // if (game.currentPlayer === 0) {
  //   featureDict["my-stranded-gems"] = nGemsNotInShape0;
  //   featureDict["opp-stranded-gems"] = nGemsNotInShape1;
  // } else {
  //   featureDict["my-stranded-gems"] = nGemsNotInShape1;
  //   featureDict["opp-stranded-gems"] = nGemsNotInShape0;
  // }

  return featureDict;
}

export function evaluateMomentum(game: GameState, depth: number): number {
  // play several moves in the future, using only the first suggested move

  // and look at the threat history to see who is making the threats
  let nMovesMade = 0; // keep track of how many moves we will need to undo, in case the game ends before reaching full depth
  let myThreats = 0; // keep track of threats I and my opponent make along the way, for momentum evaluation
  let opponentThreats = 0;
  for (let d = 0; d < depth; d++) {
    const move = makeOrderedMoveIterator(game, 1).next().value; // pass 1 for ply, won't affect much of anything b/c we aren't passing killer moves in
    if (!move) break;
    makeMove(game, move[0], move[1]);
    nMovesMade++;
    const threatsJustMade = game.threatHistory.slice(-1)[0];
    if (d % 2 === 0) myThreats += threatsJustMade;
    else opponentThreats += threatsJustMade;
  }
  // undo moves
  for (let i = 0; i < nMovesMade; i++) {
    undoMove(game);
  }

  return (myThreats - opponentThreats) / nMovesMade;
}

export function getNonlinearShapes(game: GameState): Shape[] {
  // shapes: small L, big L, hat, V, wing, big T, little t, h, X, H
  // the h, X, and H contain a three (not using tria b/c can still be useful even if partially blocked)
  // all the rest contain a stretch two (unblocked)
  // so look for these two shapes first and then check if the larger shapes are present

  const nonlinearShapes: Shape[] = [];

  // keep track of shapes by type, more efficient to find them when needed
  const categorizedShapes: Record<string, LinearShape[]> = {};
  for (const type in linearShapeDef) {
    categorizedShapes[type] = [];
  }
  game.linearShapes.forEach((shape) =>
    categorizedShapes[shape.type].push(shape)
  );

  // look for nonlinear shapes containing threes
  categorizedShapes["three"].forEach((three, i) => {
    // X
    if (!isOrthogonal(three)) {
      for (const otherThree of categorizedShapes["three"].slice(i + 1)) {
        // slice above this index to avoid finding duplicate pairs
        if (
          three.owner === otherThree.owner &&
          !isOrthogonal(otherThree) &&
          loc(three, 1) === loc(otherThree, 1)
        ) {
          // can't be same direction b/c then would be same shape
          nonlinearShapes.push({ type: "X", owner: three.owner });
        }
      }
    }
  });

  // look for nonlinear shapes containing stretch twos
  categorizedShapes["stretch-two"].forEach((two, i) => {
    if (isOrthogonal(two)) {
      // big L, look for double stretch twos
      for (const double of categorizedShapes["double-stretch-two"]) {
        if (
          two.owner === double.owner &&
          dirsOrthogonal(two, double) &&
          intersectAt(two, [1, 3], double, [1, 4])
        ) {
          nonlinearShapes.push({ type: "big-L", owner: two.owner });
        }
      }
      // small L, look for other stretch twos
      for (const otherTwo of categorizedShapes["stretch-two"].slice(i + 1)) {
        // slice above to avoid duplicate pairs
        if (
          two.owner === otherTwo.owner &&
          dirsOrthogonal(two, otherTwo) &&
          intersectAt(two, [1, 3], otherTwo, [1, 3])
        ) {
          nonlinearShapes.push({ type: "small-L", owner: two.owner });
        }
      }
    }
  });

  return nonlinearShapes;
}

function isOrthogonal(shape: LinearShape) {
  return shape.dx === 0 || shape.dy === 0;
}

function intersectAt(
  shape1: LinearShape,
  indices1: number[],
  shape2: LinearShape,
  indices2: number[]
) {
  // tests if shape1 intersects with shape2 at certain spots
  // returns true if a location from shape one indexed by indices1 matches that of one in shape 2 indexed by indices2
  for (const i1 of indices1) {
    for (const i2 of indices2) {
      if (loc(shape1, i1) === loc(shape2, i2)) return true;
    }
  }
  return false;
}

function dirsOrthogonal(shape1: LinearShape, shape2: LinearShape) {
  // dot product should be 0
  return 0 === shape1.dx * shape2.dx + shape1.dy * shape2.dy;
}
