import { type GameState, type LinearShape, linearShapeDef } from "./model_v16";

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
  for(const [k,v] of Object.entries(featureDict)){
    evaluation += featureWeights[k] * v
  }
  return 10 * evaluation  // arbitrary scaling, puts evaluations in a nice -30 to 30 range
}

const featureWeights: Record<string, number> = {
  "open-tessera-ortho": 0.898130357242619,
  "open-tessera-diag": 1.5856472006071625,
  "pente-threat-4-ortho": 1.004242353616707,
  "pente-threat-4-diag": 1.053053634013468,
  "pente-threat-31-ortho": 0.8443269407094933,
  "pente-threat-31-diag": 0.8371669866941427,
  "pente-threat-22-ortho": 0.25881273157021656,
  "pente-threat-22-diag": 0.7813980408693104,
  "open-tria-ortho": 1.141599240141442,
  "open-tria-diag": 1.0363224764528929,
  "stretch-tria-ortho": 0.6370989719841627,
  "stretch-tria-diag": 0.5698271005247311,
  "open-pair-ortho": 0.13200094521616643,
  "open-pair-diag": 0.08328099069726733,
  "capture-threat-ortho": 0.4491910099383167,
  "capture-threat-diag": 0.5849706412620426,
  "stretch-two-ortho": 0.2375696819085504,
  "stretch-two-diag": 0.16584025593676321,
  "double-stretch-two-ortho": 0.006756795137809742,
  "double-stretch-two-diag": -0.11175603290400325,
  "double-tria": -0.4541515356502728,
  "initiative": 0.15463418481516306,
  "captures": 0.8468732062848765,
  "4-captures": 0.07719359458301614
}
const currentPlayerBias = 0.48800402174019253


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
  for(const shapeType in linearShapeDef) {
    if(shapeType === "pente") continue  // not helpful, we already know who won if we find this
    if(shapesToExclude.includes(shapeType)) continue
    featureDict[shapeType + "-ortho"] = 0  // counts number I have minus number opponent has
    featureDict[shapeType + "-diag"] = 0
  }
  featureDict["double-tria"] = 0
  featureDict["initiative"] = 0
  featureDict["captures"] = 0  // me minus opponent
  featureDict["4-captures"] = 0  // if I have 4 captures, +=1, if opponent has 4 captures, -=1

  // count linear shapes, for me (current player) and for the opponent
  // keep track of double trias

  let triaCountMe = 0
  let triaCountOpponent = 0

  for (const shape of game.linearShapes) {
    if(shape.type === "pente") continue  // not helpful, we already know who won if we find this
    if(shapesToExclude.includes(shape.type)) continue

    const orientation = shape.orthogonal ? "-ortho" : "-diag"
    featureDict[shape.type + orientation] += (shape.owner === game.currentPlayer ? 1 : -1)
    if (["open-tria", "stretch-tria"].includes(shape.type)) {
      shape.owner === game.currentPlayer ? triaCountMe++ : triaCountOpponent++
    }
  }

  // record double tria
  // if both people have a double tria, it's my move, so I can take advantage of it first and I get the bonus
  if (triaCountMe >= 2) featureDict["double-tria"] = 1
  else if (triaCountOpponent >= 2) featureDict["double-tria"] = -1


  // initiative
  // if the opponent has a pente threat and you don't, you don't have the initative
  // else if the opponent has a tria and you don't, you don't have the initiative
  // else if the opponent has a capture threat and you don't, you don't have the initiative
  // else (opponent has no threats), and you can make a tria (i.e. you have pairs or stretch twos), you have the initiative
  // else you can threaten to capture a pair, you have the initiative
  // ignoring extendable trias for now
  // TODO - incorporate some measure of initiative over time, and how many threats you have waiting for the future
  
  if (game.linearShapes.some(shape => shape.type.includes("pente-threat") && shape.owner !== game.currentPlayer)) {
    // if I have a pente threat, then I've won since it's my turn, and the position feature vector won't be used
    // so we assume here that I don't have a pente threat
    featureDict["initiative"] = -1  // opponent
  }
  else if (triaCountOpponent > 0 && triaCountMe === 0){
    featureDict["initiative"] = -1
  }
  else if (game.linearShapes.some(shape => shape.type === "capture-threat" && shape.owner !== game.currentPlayer) &&
    !game.linearShapes.some(shape => shape.type === "capture-threat" && shape.owner === game.currentPlayer)) {
      featureDict["initiative"] = -1
  }
  else if (game.linearShapes.some(shape => ["open-pair", "stretch-two"].includes(shape.type) && shape.owner === game.currentPlayer)) {
    featureDict["initiative"] = 1
  }
  else if (game.linearShapes.some(shape => shape.type === "open-pair" && shape.owner !== game.currentPlayer)) {
    featureDict["initiative"] = 1
  }

  // capture eval
  const myCaptures = game.captures[game.currentPlayer]
  const opponentCaptures = game.captures[Number(!game.currentPlayer) as 0 | 1]
  featureDict["captures"] = myCaptures - opponentCaptures
  if(myCaptures === 4) featureDict["4-captures"] += 1
  if(opponentCaptures === 4) featureDict["4-captures"] -= 1

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