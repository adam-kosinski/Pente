import { type GameState, type LinearShape } from "./model_v21";

export function emptySpotsInShape(
  shape: LinearShape,
  excludeIndices: number[] = []
): number[][] {
  const spots: number[][] = [];
  const dy = shape.dy;
  const dx = shape.dx;
  for (let i = 0; i < shape.length; i++) {
    if (excludeIndices.includes(i)) continue;
    const r = shape.begin[0] + i * dy;
    const c = shape.begin[1] + i * dx;
    if (shape.pattern[i] === "_") {
      spots.push([r, c]);
    }
  }
  return spots;
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
    if (threat.pattern[i] === String(threat.owner)) threatGems.push([r, c]);
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

export function getMovesBlockingThreat(game: GameState, threat: LinearShape) {
  const blockingMoves = emptySpotsInShape(threat);

  // get capture blocking spots
  const blockingCaptureShapes = getBlockingCaptures(game, threat);
  for (const shape of blockingCaptureShapes) {
    const dy = shape.dy;
    const dx = shape.dx;
    // determine which location is the empty spot in the capture threat shape
    for (const i of [0, 3]) {
      if (shape.pattern[i] === "_") {
        const r = shape.begin[0] + i * dy;
        const c = shape.begin[1] + i * dx;
        blockingMoves.push([r, c]);
        break;
      }
    }
  }
  return blockingMoves;
}

export function getMovesBlockingAllThreats(
  game: GameState,
  threats: LinearShape[]
) {
  if (threats.length === 0) return [];

  // get all block options for the first threat
  let movesBlockingAll = Array.from(getMovesBlockingThreat(game, threats[0]));

  // get all block options for other threats, intersect with first threat
  for (let i = 1; i < threats.length; i++) {
    const movesBlockingThreat = new Set(
      getMovesBlockingThreat(game, threats[i]).map((m) => m.join(","))
    );
    movesBlockingAll = movesBlockingAll.filter((s) =>
      movesBlockingThreat.has(s.join(","))
    );
    // if no moves exist that can block all threats, stop looking
    if (movesBlockingAll.length === 0) break;
  }
  // if at the end of all threats, the intersection between all threats are the moves that block all of them
  return movesBlockingAll;
}

export function loc(shape: LinearShape, index: number): string {
  // returns the location within the shape that is index spots away from the shape's beginning
  // returning a string version of the location because usually we want to check if two locations are the same
  return [
    shape.begin[0] + index * shape.dy,
    shape.begin[1] + index * shape.dx,
  ].toString();
}

export function getKeystoneCaptureThreats(game: GameState) {
  const captureThreats = game.linearShapes.filter(
    (shape) => shape.type === "capture-threat"
  );
  const blockedPentes = game.linearShapes.filter((shape) =>
    shape.type.includes("blocked-pente")
  );

  const keystoneCaptureThreats: LinearShape[] = [];

  // loop through blocked pentes to find keystones
  const keystoneLocations = new Set<string>();
  for (const blockedPente of blockedPentes) {
    for (let i = 0; i < blockedPente.length; i++) {
      if (blockedPente.pattern[i] !== String(blockedPente.owner)) {
        keystoneLocations.add(loc(blockedPente, i));
      }
    }
  }

  // loop through capture threats to see if they contain a keystone
  // don't actually need to check shape owners, because if a keystone is being threatened, that's always a keystone threat
  for (const threat of captureThreats) {
    if (
      keystoneLocations.has(loc(threat, 1)) ||
      keystoneLocations.has(loc(threat, 2))
    ) {
      keystoneCaptureThreats.push(threat);
    }
  }

  return keystoneCaptureThreats;
}
