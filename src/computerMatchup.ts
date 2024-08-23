import { chooseMove as engine14 } from "./engine_v14/engine_v14";
import { chooseMove as engine15 } from "./engine_v15/engine_v15";
import { chooseMove as engine16 } from "./engine_v16_diag_orthog/engine_v16";
import { chooseMove as engine17 } from "./engine_v17/engine_v17";
import { chooseMove as engine18 } from "./engine_v18/engine_v18";
import { chooseMove as engine19 } from "./engine_v19/engine_v19";
import { createNewGame as create14 } from "./engine_v14/model_v14";
import { createNewGame as create15 } from "./engine_v15/model_v15";
import { createNewGame as create16 } from "./engine_v16_diag_orthog/model_v16";
import { createNewGame as create17 } from "./engine_v17/model_v17";
import { createNewGame as create18 } from "./engine_v18/model_v18"
import { createNewGame as create19 } from "./engine_v19/model_v19"
import { makeMove as move14, type GameState as Game14 } from "./engine_v14/model_v14";
import { makeMove as move15, type GameState as Game15 } from "./engine_v15/model_v15";
import { makeMove as move16, type GameState as Game16 } from "./engine_v16_diag_orthog/model_v16";
import { makeMove as move17, type GameState as Game17 } from "./engine_v17/model_v17";
import { makeMove as move18, type GameState as Game18 } from "./engine_v18/model_v18";
import { makeMove as move19, type GameState as Game19 } from "./engine_v19/model_v19";
import { evaluatePosition, positionFeatureDict } from "./engine_v19/evaluation_v19";
import { createNewGame, gameToString, makeMove } from "./engine_v19/model_v19";
import * as papa from "papaparse";
import { gameStrings } from "./gameStrings";


// v is short for versions
const v = [
  { engine: engine14, create: create14, move: move14 },  // manual eval values
  { engine: engine15, create: create15, move: move15 },  // fitted eval values
  { engine: engine16, create: create16, move: move16 },  // diag / orthog linear shapes
  { engine: engine17, create: create17, move: move17 },  // more eval features
  { engine: engine18, create: create18, move: move18 },  // better move generation and search extension, most importantly uses different opening evaluation, softmax for move choice
  { engine: engine19, create: create19, move: move19 }   // linear shapes store dx and dy and other updateLinearShapes optimizations, removed unnecessary eval features
]

const gameStringSet = new Set<string>(gameStrings)

export function playGame(firstPlayer: number, secondPlayer: number, maxDepth: number, msPerMove: number) {
  // first/second player refers to the index in the engines list

  const game0 = v[firstPlayer].create(19)
  const game1 = v[secondPlayer].create(19)

  // don't waste time analyzing first move, only one option
  const center = Math.floor(game0.board.length / 2)
  v[firstPlayer].move(game0, center, center)
  v[secondPlayer].move(game1, center, center)

  while (!game1.isOver) {
    // make move
    const engine = game1.currentPlayer === 0 ? v[firstPlayer].engine : v[secondPlayer].engine
    const gameToAnalyze = game1.currentPlayer === 0 ? game0 : game1
    const move = engine(gameToAnalyze, maxDepth, msPerMove, false)
    if (move !== undefined) {
      v[firstPlayer].move(game0, move[0], move[1])
      v[secondPlayer].move(game1, move[0], move[1])
    }
    else {
      console.log("ERROR, game string:", gameToString(game1))
      console.error("Couldn't find a move")
      console.log(game1.currentPlayer === 0 ? "first player" : "second player")
    }
  }

  return {
    winner: Number(!game1.currentPlayer),
    gameString: gameToString(game1),
  }
}


export function runCompetition(engineA: number, engineB: number, msPerMove: number, nGames: number) {
  // engine A and B are indices in the engines array

  const winCounts = {
    "A": 0,
    "B": 0
  }

  for (let i = 0; i < nGames; i++) {
    console.log("Game", i + 1)

    const engineAFirst = i % 2 === 0
    const result = engineAFirst ? playGame(engineA, engineB, 15, msPerMove) : playGame(engineB, engineA, 15, msPerMove)
    console.log(result.gameString)

    // don't count duplicate games
    if (gameStringSet.has(result.gameString)) {
      console.log("DUPLICATE!")
      continue
    }
    gameStringSet.add(result.gameString)

    // tally who won
    if (engineAFirst && result.winner === 0 || !engineAFirst && result.winner === 1) {
      console.log("A won")
      winCounts["A"]++
    }
    else {
      console.log("B won")
      winCounts["B"]++
    }

    // print out strings every so often in case of an error
    if ((i + 1) % 20 === 0) {
      console.log(JSON.stringify(Array.from(gameStringSet.values()), null, 2))
      console.log(gameStringSet.size + " total games now")
    }
  }
  console.log(JSON.stringify(Array.from(gameStringSet.values()), null, 2))
  console.log(gameStringSet.size + " total games now")
  console.log(winCounts)
}



export function generateFeatureCSV(nFeaturesPerGame: number, minMoveIndex: number = 0, maxMoveIndex: number = Infinity) {

  const featureDictArray: Record<string, number>[] = []

  for (const s of gameStringSet.values()) {

    // parse game string
    const [size, moveString] = s.split("~")
    const moves = moveString.split("|").map(m => m.split(".").map(x => Number(x)))

    // keep track of position features for when it's player 0's turn, or player 1's turn
    const player0FeatureDicts: Record<string, number>[] = []
    const player1FeatureDicts: Record<string, number>[] = []

    // replay game and extract position features
    const game = createNewGame(Number(size))
    for (let m = 0; m < moves.length; m++) {
      const [r, c] = moves[m]
      makeMove(game, r, c)

      if(m < minMoveIndex || m > maxMoveIndex) continue

      // get position features if game not forced win/loss
      const evaluation = evaluatePosition(game)
      if (Math.abs(evaluation) !== Infinity) {
        const featureDict = positionFeatureDict(game)
        game.currentPlayer === 0 ? player0FeatureDicts.push(featureDict) : player1FeatureDicts.push(featureDict)
      }
    }

    // update feature dicts to include who won
    const winner = Number(!game.currentPlayer)
    for (const featureDict of player0FeatureDicts) {
      featureDict["won"] = (winner === 0 ? 1 : 0)
    }
    for (const featureDict of player1FeatureDicts) {
      featureDict["won"] = (winner === 1 ? 1 : 0)
    }

    // add to big list, only keeping some features
    const allFeatureDicts = player0FeatureDicts.concat(player1FeatureDicts)
    const selectedFeatureDicts: Record<string, number>[] = []
    for (let i = 0; i < nFeaturesPerGame; i++) {
      if (allFeatureDicts.length === 0) break
      const idx = Math.floor(Math.random() * allFeatureDicts.length)
      const selected = allFeatureDicts.splice(idx, 1)[0]
      selectedFeatureDicts.push(selected)
    }
    featureDictArray.push.apply(featureDictArray, selectedFeatureDicts)
  }

  console.log(papa.unparse(featureDictArray))
}
