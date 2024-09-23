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
import {
  getNonQuietMoves,
  makeOrderedMoveIterator,
} from "./move_generation_v21";

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
  if (!canBlockAllThreats(game, opponentPenteThreats)) return -Infinity;

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

const openingIdx = 19;
const blendRange = 6;

const openingFeatureWeights: Record<string, number> = {
  "opp-open-tessera": -1.501266685684894,
  "opp-pente-threat-4": -1.4970996919514639,
  "opp-pente-threat-31": -1.5097172860752919,
  "opp-pente-threat-22": -1.13762600691966,
  "my-open-tria": 1.550115779602984,
  "opp-open-tria": -1.8329314071160114,
  "my-stretch-tria": 1.1101678639712869,
  "opp-stretch-tria": -1.0313204774868312,
  "my-open-pair": 0.31489762188218834,
  "opp-open-pair": -0.04206903766040025,
  "my-capture-threat": 1.098601463129866,
  "opp-capture-threat": -0.7737789061800467,
  "my-stretch-two": 0.6425445824680261,
  "opp-stretch-two": -0.5033365725539397,
  "my-double-stretch-two": 0.1331809772949043,
  "opp-double-stretch-two": -0.05976820915304173,
  "my-pente-potential-1": 0.098665214561219,
  "opp-pente-potential-1": -0.15404044889695961,
  "my-pente-potential-2": 0.5882582040514875,
  "opp-pente-potential-2": -0.4793033328763009,
  "my-captures": 1.1996563258837927,
  "opp-captures": -1.0594093851458255,
  "my-4-captures": 0.0,
  "opp-4-captures": 0.0,
  "my-actionable-threats": 0.570153045120629,
};
const openingCurrentPlayerBias = 0.18072793301764986;

const laterFeatureWeights: Record<string, number> = {
  "opp-open-tessera": -2.1912729731767975,
  "opp-pente-threat-4": -1.4275590520953554,
  "opp-pente-threat-31": -1.4668901049193543,
  "opp-pente-threat-22": -1.265863621756788,
  "my-open-tria": 1.3373656991765925,
  "opp-open-tria": -1.5292682585957824,
  "my-stretch-tria": 1.1505671227067449,
  "opp-stretch-tria": -0.8034251682798529,
  "my-open-pair": 0.13109363335491495,
  "opp-open-pair": -0.03919807818672472,
  "my-capture-threat": 0.7952997399640607,
  "opp-capture-threat": -0.6286127841114798,
  "my-stretch-two": 0.2845380519007305,
  "opp-stretch-two": -0.23360778708607868,
  "my-double-stretch-two": -0.07319346447230184,
  "opp-double-stretch-two": 0.11028970867012787,
  "my-pente-potential-1": 0.8735300976510494,
  "opp-pente-potential-1": -0.5854491649017737,
  "my-pente-potential-2": 0.505825973950463,
  "opp-pente-potential-2": -0.21492384445442309,
  "my-captures": 1.0003554089282385,
  "opp-captures": -0.9782673009599122,
  "my-4-captures": 0.6546643885214608,
  "opp-4-captures": -1.2085250785056305,
  "my-actionable-threats": 0.5725324693821173,
};
const laterCurrentPlayerBias = 0.17887124938464527;

// some shapes aren't useful for evaluation, but are still used for move ordering
const shapesToExclude = [
  "pente-potential-2",
  "extendable-tria",
  "extendable-stretch-tria-1",
  "extendable-stretch-tria-2",
  "three-gap",
  "three",
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
  // featureDict["non-quiet-moves"] = getNonQuietMoves(game).length
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
  // featureDict["can-block-trias"] = Number(
  //   canBlockAllThreats(game, opponentPenteThreats.concat(opponentTrias))
  // );

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

export function getBlockingCaptures(
  game: GameState,
  threat: LinearShape
): LinearShape[] {
  const blockingCaptures: LinearShape[] = [];

  const threatGems: number[][] = [];
  for (let i = 0; i < threat.length; i++) {
    const r = threat.begin[0] + i * threat.dy;
    const c = threat.begin[1] + i * threat.dx;
    if (threat.pattern[i] !== "_") threatGems.push([r, c]);
  }

  for (const shape of game.linearShapes) {
    if (shape.type !== "capture-threat" || shape.owner === threat.owner)
      continue;

    const dy = shape.dy;
    const dx = shape.dx;
    for (const i of [1, 2]) {
      const r = shape.begin[0] + i * dy;
      const c = shape.begin[1] + i * dx;
      if (threatGems.some((gem) => gem[0] === r && gem[1] === c)) {
        blockingCaptures.push(shape);
        break;
      }
    }
  }
  return blockingCaptures;
}

export function getCapturesBlockingAll(
  game: GameState,
  threats: LinearShape[]
) {
  let capturesBlockingAll = getBlockingCaptures(game, threats[0]);
  for (let i = 1; i < threats.length; i++) {
    const captureHashSet = new Set(
      getBlockingCaptures(game, threats[i]).map((s) => s.hash)
    );
    capturesBlockingAll = capturesBlockingAll.filter((s) =>
      captureHashSet.has(s.hash)
    );
  }
  return capturesBlockingAll;
}

export function canBlockAllThreats(
  game: GameState,
  threats: LinearShape[]
): boolean {
  // function to check whether placing a gem can block all the threats
  // a threat can be blocked by placing a gem within it, or by capturing one of its gems

  if (threats.length <= 1) return true;

  let blockSpot: string = "";
  let normalBlockWorks = true;

  for (const threat of threats) {
    const dy = threat.dy;
    const dx = threat.dx;
    for (let i = 0; i < threat.length; i++) {
      const r = threat.begin[0] + i * dy;
      const c = threat.begin[1] + i * dx;
      if (threat.pattern[i] === "_") {
        const s = r + "," + c;
        if (blockSpot === "")
          blockSpot = s; // if first spot we need to block, write it down
        else if (blockSpot !== s) {
          // if we found a second, different spot we need to block, can't do both at once
          normalBlockWorks = false;
          break;
        }
      }
    }
    if (!normalBlockWorks) break;
  }

  if (normalBlockWorks) return true;

  // otherwise, try blocking by capturing from all the threats
  let capturesBlockingAll = getCapturesBlockingAll(game, threats);
  if (capturesBlockingAll.length === 0) return false;
  return true;
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

function loc(shape: LinearShape, index: number): string {
  // returns the location within the shape that is index spots away from the shape's beginning
  // returning a string version of the location because usually we want to check if two locations are the same
  return [
    shape.begin[0] + index * shape.dy,
    shape.begin[1] + index * shape.dx,
  ].toString();
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
