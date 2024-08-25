import { type GameState, gameToString, type LinearShape, linearShapeDef, nonlinearShapeTypes, type Shape } from "./model_v19";
import { getNonQuietMoves, makeOrderedMoveIterator } from "./move_generation_v19";
import { openingBook } from "@/openingBook";

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


const openingIdx = 13
const blendRange = 6

const openingFeatureWeights: Record<string, number> = {
  "open-tessera": 1.09196884114321,
  "pente-threat-4": 1.1269100111739518,
  "pente-threat-31": 1.4746191199474363,
  "pente-threat-22": 0.8633205468991513,
  "open-tria": 2.2411762622892017,
  "stretch-tria": 1.5647589584161157,
  "open-pair": 0.16697598180822756,
  "capture-threat": 0.651118013382177,
  "stretch-two": 0.6942526722599187,
  "three-gap": 0.3897691876626624,
  "pente-potential-1": 0.06622798173859057,
  "pente-potential-2": 0.6029369708384013,
  "captures": 1.4490197004354368,
  "4-captures": 0.0,
  "can-block-trias": 0.5842933741981076,
  "non-quiet-moves": 0.47202937502645925,
  "not-in-shape": 0.04762031070973125
}
const openingCurrentPlayerBias = -0.2522576144672106

const laterFeatureWeights: Record<string, number> = {
  "open-tessera": 2.7534588021054844,
  "pente-threat-4": 1.3918908934897476,
  "pente-threat-31": 1.3631066196895458,
  "pente-threat-22": 1.1154033401602412,
  "open-tria": 1.7738350164880838,
  "stretch-tria": 1.338874085652772,
  "open-pair": 0.08825320631309726,
  "capture-threat": 0.6284732703343117,
  "stretch-two": 0.29941407342134035,
  "three-gap": 0.08754044074489892,
  "pente-potential-1": 0.6057057503270546,
  "pente-potential-2": 0.2916796921220024,
  "captures": 0.9432543685080037,
  "4-captures": 0.915172751334423,
  "can-block-trias": 0.6762239431184117,
  "non-quiet-moves": 0.2604025324878405,
  "not-in-shape": -0.08724525042188253
}
const laterCurrentPlayerBias = 0.05690662516990377


// some shapes aren't useful for evaluation, but are still used for move ordering
const shapesToExclude = [
  "extendable-tria",
  "extendable-stretch-tria-1",
  "extendable-stretch-tria-2",
  "double-stretch-two",
  "three"
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
  // for(const shapeType of nonlinearShapeTypes) {
  //   featureDict[shapeType] = 0
  // }
  featureDict["captures"] = 0  // me minus opponent
  featureDict["4-captures"] = 0  // if I have 4 captures, +=1, if opponent has 4 captures, -=1
  featureDict["can-block-trias"] = 0
  featureDict["non-quiet-moves"] = getNonQuietMoves(game).length
  featureDict["move-index"] = game.nMoves
  featureDict["not-in-shape"] = 0
  // featureDict["momentum"] = 0
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

  // count nonlinear shapes
  // for(const shape of getNonlinearShapes(game)){
  //   featureDict[shape.type] += shape.owner === game.currentPlayer ? 1 : -1
  // }

  // count captures
  const myCaptures = game.captures[game.currentPlayer]
  const opponentCaptures = game.captures[Number(!game.currentPlayer) as 0 | 1]
  featureDict["captures"] = myCaptures - opponentCaptures
  if (myCaptures === 4) featureDict["4-captures"] += 1
  if (opponentCaptures === 4) featureDict["4-captures"] -= 1

  // see if we can block all opponent trias
  featureDict["can-block-trias"] = Number(canBlockAllThreats(game, opponentTrias))

  // count fraction of gems in a linear shape
  const gemLocations = new Set<string>()
  // iterate through linear shapes
  for(const shape of game.linearShapes){
    for(let i=0; i<shape.length; i++){
      if(shape.pattern.charAt(i) !== "_"){
        gemLocations.add(loc(shape, i))
      }
    }
  }
  // iterate through gems on board
  for (let r = 0; r < game.board.length; r++) {
    for (const c in game.board[r]) {
      if(!gemLocations.has([r,c].toString())){
        featureDict["not-in-shape"] += game.board[r][c] === game.currentPlayer ? 1 : -1
      }
    }
  }

  // look at recent threat history to evaluate momentum
  // for(let i = 1; i<=3; i++){
  //   if (game.threatHistory.length - i < 0) break
  //   const parity = i%2 === 0 ? 1 : -1
  //   const weight = 1//0.8**(i-1)
  //   const threatsAdded = game.threatHistory[game.threatHistory.length - i]
  //   featureDict["momentum"] += (parity * weight * threatsAdded)
  // }

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



export function getNonlinearShapes(game: GameState): Shape[] {
  // shapes: small L, big L, hat, V, wing, big T, little t, h, X, H
  // the h, X, and H contain a three (not using tria b/c can still be useful even if partially blocked)
  // all the rest contain a stretch two (unblocked)
  // so look for these two shapes first and then check if the larger shapes are present

  const nonlinearShapes: Shape[] = []

  // keep track of shapes by type, more efficient to find them when needed
  const categorizedShapes: Record<string, LinearShape[]> = {}
  for (const type in linearShapeDef) {
    categorizedShapes[type] = []
  }
  game.linearShapes.forEach(shape => categorizedShapes[shape.type].push(shape))

  // look for nonlinear shapes containing threes
  categorizedShapes["three"].forEach((three, i) => {
    // X
    if (!isOrthogonal(three)) {
      for (const otherThree of categorizedShapes["three"].slice(i + 1)) {  // slice above this index to avoid finding duplicate pairs
        if (three.owner === otherThree.owner && !isOrthogonal(otherThree) && loc(three, 1) === loc(otherThree, 1)) {  // can't be same direction b/c then would be same shape
          nonlinearShapes.push({ type: "X", owner: three.owner })
        }
      }
    }
  })

  // look for nonlinear shapes containing stretch twos
  categorizedShapes["stretch-two"].forEach((two, i) => {
    if (isOrthogonal(two)) {
      // big L, look for double stretch twos
      for (const double of categorizedShapes["double-stretch-two"]) {
        if (two.owner === double.owner && dirsOrthogonal(two, double) && intersectAt(two, [1, 3], double, [1, 4])
        ) {
          nonlinearShapes.push({ type: "big-L", owner: two.owner })
        }
      }
      // small L, look for other stretch twos
      for (const otherTwo of categorizedShapes["stretch-two"].slice(i + 1)) { // slice above to avoid duplicate pairs
        if (two.owner === otherTwo.owner && dirsOrthogonal(two, otherTwo) && intersectAt(two, [1, 3], otherTwo, [1, 3])){
          nonlinearShapes.push({ type: "small-L", owner: two.owner })
        }
      }
    }
  })


  return nonlinearShapes
}


function isOrthogonal(shape: LinearShape) {
  return shape.dx === 0 || shape.dy === 0
}

function loc(shape: LinearShape, index: number): string {
  // returns the location within the shape that is index spots away from the shape's beginning
  // returning a string version of the location because usually we want to check if two locations are the same
  return [shape.begin[0] + index * shape.dy, shape.begin[1] + index * shape.dx].toString()
}

function intersectAt(shape1: LinearShape, indices1: number[], shape2: LinearShape, indices2: number[]) {
  // tests if shape1 intersects with shape2 at certain spots
  // returns true if a location from shape one indexed by indices1 matches that of one in shape 2 indexed by indices2
  for (const i1 of indices1) {
    for (const i2 of indices2) {
      if (loc(shape1, i1) === loc(shape2, i2)) return true
    }
  }
  return false
}

function dirsOrthogonal(shape1: LinearShape, shape2: LinearShape){
  // dot product should be 0
  return 0 === (shape1.dx * shape2.dx) + (shape1.dy * shape2.dy)
}