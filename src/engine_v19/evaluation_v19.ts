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
  "open-tessera": 0.7054256860796352,
  "pente-threat-4": 1.1817703617875197,
  "pente-threat-31": 1.7421854675467938,
  "pente-threat-22": 0.875138540644574,
  "open-tria": 2.202776159547307,
  "stretch-tria": 1.5768971609704574,
  "open-pair": 0.12603709407788413,
  "capture-threat": 0.6803086159765149,
  "stretch-two": 0.6758821906011587,
  "three-gap": 0.3961008952441541,
  "pente-potential-1": 0.07572581845511037,
  "pente-potential-2": 0.5772857906947709,
  "captures": 1.4881240112585623,
  "4-captures": 0.0,
  "can-block-trias": 0.5049282244232708,
  "non-quiet-moves": 0.4569909601223369
}
const openingCurrentPlayerBias = -0.2040235124872943

const laterFeatureWeights: Record<string, number> = {
  "open-tessera": 2.839114853604894,
  "pente-threat-4": 1.4192646141687402,
  "pente-threat-31": 1.3952607276862967,
  "pente-threat-22": 1.0953587566503178,
  "open-tria": 1.8465202983085667,
  "stretch-tria": 1.3611765230488788,
  "open-pair": 0.13712607888642475,
  "capture-threat": 0.5929149645250404,
  "stretch-two": 0.35156688785524115,
  "three-gap": 0.16017105703694612,
  "pente-potential-1": 0.5824994119359308,
  "pente-potential-2": 0.3497451813564464,
  "captures": 0.8967602994509206,
  "4-captures": 0.8875143398759777,
  "can-block-trias": 0.7788552900286067,
  "non-quiet-moves": 0.27635056958537946
}
const laterCurrentPlayerBias = 0.003995441438307233


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