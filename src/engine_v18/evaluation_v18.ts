import { type GameState, type LinearShape, linearShapeDef } from "./model_v18";
import { getNonQuietMoves, makeOrderedMoveIterator } from "./move_generation_v18";

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
  const openingWeight = Math.max(0, Math.min(1, 3 - (0.25 * game.nMoves)))
  let evaluation = openingCurrentPlayerBias * openingWeight + currentPlayerBias * (1 - openingWeight)
  for (const [k, v] of Object.entries(featureDict)) {
    if (k in featureWeights) {
      evaluation += v * (openingFeatureWeights[k] * openingWeight + featureWeights[k] * (1 - openingWeight))
    }
  }
  return 10 * evaluation  // arbitrary scaling
}


const featureWeights: Record<string, number> = {
  "open-tessera": 2.3262898143345128,
  "pente-threat-4": 1.931325800410917,
  "pente-threat-31": 1.8784987650724434,
  "pente-threat-22": 1.8523783616966716,
  "open-tria": 2.011500382249705,
  "stretch-tria": 1.2755344862869074,
  "open-pair": 0.22345192530294544,
  "capture-threat": 0.6398978506156765,
  "stretch-two": 0.5059533141586162,
  "double-stretch-two": -0.031543175991969256,
  "three-gap": 0.24993006362008163,
  "pente-potential-1": 0.9194719017712562,
  "pente-potential-2": 0.6465971171700069,
  "captures": 1.1052105254360394,
  "4-captures": 0.05235393349796206,
  "can-block-trias": 0.7974538869236613,
  "my-open-trias": -0.15068927838962512,
  "my-stretch-trias": -0.19457137702117436,
  "non-quiet-moves": 0.4299902733567633
}
const currentPlayerBias = -0.4840183351512664


const openingFeatureWeights: Record<string, number> = {
  "open-tessera": 0.16382045598699985,
  "pente-threat-4": 1.933716988434214,
  "pente-threat-31": 2.0971965396271077,
  "pente-threat-22": 0.7370080072628162,
  "open-tria": 2.424302972226337,
  "stretch-tria": 0.764170473401372,
  "open-pair": 0.19762723631647697,
  "capture-threat": 0.828476815977951,
  "stretch-two": 0.853840225607935,
  "double-stretch-two": -0.03724614114367376,
  "three-gap": 0.25846748129983693,
  "pente-potential-1": 0.38810607910740064,
  "pente-potential-2": 0.6442108365643338,
  "captures": 1.8969433568078122,
  "4-captures": 0.0,
  "can-block-trias": 0.7498924763524428,
  "my-open-trias": 0.227150984962449,
  "my-stretch-trias": 0.15963966381216343,
  "non-quiet-moves": 0.5038152105492621
}
const openingCurrentPlayerBias = -0.4309151058620979


// some shapes aren't useful for evaluation, but are still used for move ordering
const shapesToExclude = [
  "extendable-tria",
  "extendable-stretch-tria-1",
  "extendable-stretch-tria-2",
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
  featureDict["my-open-trias"] = 0
  featureDict["my-stretch-trias"] = 0
  featureDict["non-quiet-moves"] = getNonQuietMoves(game).length
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
    if (["open-tria", "stretch-tria"].includes(shape.type) && shape.owner !== game.currentPlayer) {
      opponentTrias.push(shape)
    }
    if (shape.type === "open-tria" && shape.owner === game.currentPlayer) featureDict["my-open-trias"]++
    if (shape.type === "stretch-tria" && shape.owner === game.currentPlayer) featureDict["my-stretch-trias"]++
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
  const threat_dy = Math.sign(threat.end[0] - threat.begin[0])
  const threat_dx = Math.sign(threat.end[1] - threat.begin[1])
  for (let i = 0; i < threat.length; i++) {
    const r = threat.begin[0] + i * threat_dy
    const c = threat.begin[1] + i * threat_dx
    if (threat.pattern[i] !== "_") threatGems.push([r, c])
  }

  for (const shape of game.linearShapes) {
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
  let capturesBlockingAll = getCapturesBlockingAll(game, threats)
  if (capturesBlockingAll.length === 0) return false
  return true
}