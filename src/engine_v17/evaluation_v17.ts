import { type GameState, type LinearShape, linearShapeDef } from "./model_v17";
import { getNonQuietMoves } from "./move_generation_v17";

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
  if (!canBlockAllThreats(game, opponentPenteThreats)) return -Infinity

  // use position feature dict along with weights and bias to compute evaluation
  const featureDict = positionFeatureDict(game)
  let evaluation = currentPlayerBias
  for (const [k, v] of Object.entries(featureDict)) {
    evaluation += featureWeights[k] * v
  }
  return 10 * evaluation  // arbitrary scaling
}

const featureWeights: Record<string, number> = {
  "open-tessera": 1.5939910031498628,
  "pente-threat-4": 1.3473289025030872,
  "pente-threat-31": 0.9779149978765185,
  "pente-threat-22": 0.5581765756874775,
  "open-tria": 1.2165966226601612,
  "stretch-tria": 0.920863365562939,
  "open-pair": 0.12507814020211527,
  "capture-threat": 0.4205678544444044,
  "stretch-two": 0.22891201660022714,
  "double-stretch-two": -0.032559842536416805,
  "captures": 0.7604620476575394,
  "4-captures": 0.7612332715434451,
  "threats": 0.26216170694371144,
  "can-block-trias": 0.41992121017097844,
  "my-open-trias": 0.18451162467512888,
  "my-stretch-trias": 0.024331955906516444
}
const currentPlayerBias = -0.2506872305311969


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
  featureDict["threats"] = getNonQuietMoves(game).length
  featureDict["can-block-trias"] = 0
  featureDict["my-open-trias"] = 0
  featureDict['my-stretch-trias'] = 0

  // count linear shapes, for me (current player) and for the opponent
  const opponentTrias: LinearShape[] = []
  for (const shape of game.linearShapes) {
    if (shape.type === "pente") continue  // not helpful, we already know who won if we find this
    if (shapesToExclude.includes(shape.type)) continue
    featureDict[shape.type] += shape.owner === game.currentPlayer ? 1 : -1

    if(shape.type.includes("tria") && shape.owner !== game.currentPlayer){
      opponentTrias.push(shape)
    }
    if(shape.type === "open-tria" && shape.owner === game.currentPlayer) featureDict["my-open-trias"]++
    if(shape.type === "stretch-tria" && shape.owner === game.currentPlayer) featureDict["my-stretch-trias"]++
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

  let capturesBlockingAll = getBlockingCaptures(game.linearShapes, threats[0])
  for (let i = 1; i < threats.length; i++) {
    const captureHashSet = new Set(getBlockingCaptures(game.linearShapes, threats[i]).map(s => s.hash))
    capturesBlockingAll = capturesBlockingAll.filter(s => captureHashSet.has(s.hash))
  }
  if (capturesBlockingAll.length === 0) return false
  return true
}