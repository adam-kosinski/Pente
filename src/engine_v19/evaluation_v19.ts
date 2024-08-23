import { type GameState, type LinearShape, linearShapeDef } from "./model_v19";
import { getNonQuietMoves, makeOrderedMoveIterator } from "./move_generation_v19";

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
      const blockingCaptures = getBlockingCaptures(game, shape)
      if (blockingCaptures.length === 0) return -Infinity
    }
    else if (shape.owner !== game.currentPlayer && shape.type.includes("pente-threat")) {
      opponentPenteThreats.push(shape)
    }
  }
  // if opponent has multiple pente threats, check if we can block them all
  if (!canBlockAllThreats(game, opponentPenteThreats)) return -Infinity

  // use position feature dict along with weights and bias to compute evaluation
  const featureDict = positionFeatureDict(game)
  const openingWeight = Math.max(0, Math.min(1, 0.5 + ((openingIdx - game.nMoves) / blendRange)))
  // init eval as the intercept, and then add in features * weights
  let evaluation = openingCurrentPlayerBias * openingWeight + laterCurrentPlayerBias * (1 - openingWeight)
  for (const [k, v] of Object.entries(featureDict)) {
    if (k in openingFeatureWeights && k in laterFeatureWeights) {
      evaluation += v * (openingFeatureWeights[k] * openingWeight + laterFeatureWeights[k] * (1 - openingWeight))
    }
  }
  return 10 * evaluation  // arbitrary scaling
}


const openingIdx = 12
const blendRange = 4

const openingFeatureWeights: Record<string, number> = {
  "open-tessera": 0.7142846665149541,
  "pente-threat-4": 1.460423474901643,
  "pente-threat-31": 1.7926897505119432,
  "pente-threat-22": 1.0820691431942682,
  "open-tria": 2.348847906615784,
  "stretch-tria": 1.6796377537114986,
  "open-pair": 0.1583237946582207,
  "capture-threat": 0.701008780943482,
  "stretch-two": 0.7292003053126962,
  "three-gap": 0.5074457767046938,
  "pente-potential-1": 0.10513479297955895,
  "pente-potential-2": 0.5448641632742927,
  "captures": 1.4123467702449712,
  "4-captures": 0.0,
  "can-block-trias": 0.5520212551906103,
  "non-quiet-moves": 0.5070259353701644
}
const openingCurrentPlayerBias = -0.23929567023925047

const laterFeatureWeights: Record<string, number> = {
  "open-tessera": 2.894385172811964,
  "pente-threat-4": 1.4293730441139314,
  "pente-threat-31": 1.339967366177731,
  "pente-threat-22": 1.0946172159443657,
  "open-tria": 1.8448769004339054,
  "stretch-tria": 1.302738715912809,
  "open-pair": 0.13047654933945022,
  "capture-threat": 0.5792991598862727,
  "stretch-two": 0.34384733550884033,
  "three-gap": 0.2291155251490014,
  "pente-potential-1": 0.512995812429531,
  "pente-potential-2": 0.44447810236352725,
  "captures": 0.9220501800426152,
  "4-captures": 1.0367781104801042,
  "can-block-trias": 0.8685945074453137,
  "non-quiet-moves": 0.27784749558781685
}
const laterCurrentPlayerBias = -0.04766462636742246


// some shapes aren't useful for evaluation, but are still used for move ordering
const shapesToExclude = [
  "extendable-tria",
  "extendable-stretch-tria-1",
  "extendable-stretch-tria-2",
  "double-stretch-two"
]


export function positionFeatureDict(game: GameState): Record<string, number> {
  // returns an object of useful information for evaluating the position

  // init feature dict with all possible fields
  const featureDict: Record<string, number> = {}
  for (const shapeType in linearShapeDef) {
    if (shapeType === "pente") continue  // not helpful, we already know who won if we find this
    if (shapesToExclude.includes(shapeType)) continue
    featureDict[shapeType] = 0  // counts number I have minus number opponent has
  }
  featureDict["captures"] = 0  // me minus opponent
  featureDict["4-captures"] = 0  // if I have 4 captures, +=1, if opponent has 4 captures, -=1
  featureDict["can-block-trias"] = 0
  featureDict["non-quiet-moves"] = getNonQuietMoves(game).length
  featureDict["move-index"] = game.nMoves
  // featureDict["forcing-moves"] = Array.from(makeOrderedMoveIterator(game, true)).length

  // count linear shapes, for me (current player) and for the opponent
  const opponentTrias: LinearShape[] = []
  for (const shape of game.linearShapes) {
    if (shape.type === "pente") continue  // not helpful, we already know who won if we find this

    // count me minus opponent
    if (!shapesToExclude.includes(shape.type)) {
      featureDict[shape.type] += shape.owner === game.currentPlayer ? 1 : -1
    }

    // count trias
    if (shape.type.includes("tria") && shape.owner !== game.currentPlayer) {
      opponentTrias.push(shape)
    }
  }

  // count captures
  const myCaptures = game.captures[game.currentPlayer]
  const opponentCaptures = game.captures[Number(!game.currentPlayer) as 0 | 1]
  featureDict["captures"] = myCaptures - opponentCaptures
  if (myCaptures === 4) featureDict["4-captures"] += 1
  if (opponentCaptures === 4) featureDict["4-captures"] -= 1

  // see if we can block all opponent trias
  featureDict["can-block-trias"] = Number(canBlockAllThreats(game, opponentTrias))

  return featureDict
}



export function getBlockingCaptures(game: GameState, threat: LinearShape): LinearShape[] {
  const blockingCaptures: LinearShape[] = []

  const threatGems: number[][] = []
  for (let i = 0; i < threat.length; i++) {
    const r = threat.begin[0] + i * threat.dy
    const c = threat.begin[1] + i * threat.dx
    if (threat.pattern[i] !== "_") threatGems.push([r, c])
  }

  for (const shape of game.linearShapes) {
    if (shape.type !== "capture-threat" || shape.owner === threat.owner) continue

    const dy = shape.dy
    const dx = shape.dx
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


export function getCapturesBlockingAll(game: GameState, threats: LinearShape[]) {
  let capturesBlockingAll = getBlockingCaptures(game, threats[0])
  for (let i = 1; i < threats.length; i++) {
    const captureHashSet = new Set(getBlockingCaptures(game, threats[i]).map(s => s.hash))
    capturesBlockingAll = capturesBlockingAll.filter(s => captureHashSet.has(s.hash))
  }
  return capturesBlockingAll
}


export function canBlockAllThreats(game: GameState, threats: LinearShape[]): boolean {
  // function to check whether placing a gem can block all the threats
  // a threat can be blocked by placing a gem within it, or by capturing one of its gems

  if (threats.length === 0) return true

  let blockSpot: string = ""
  let normalBlockWorks = true

  for (const threat of threats) {
    const dy = threat.dy
    const dx = threat.dx
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
  let capturesBlockingAll = getCapturesBlockingAll(game, threats)
  if (capturesBlockingAll.length === 0) return false
  return true
}