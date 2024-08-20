import { chooseMove as engine14 } from "./engine_v14/engine_v14";
import { chooseMove as engine15 } from "./engine_v15/engine_v15";
import { chooseMove as engine16 } from "./engine_v16/engine_v16";
import { evaluatePosition, positionFeatureDict } from "./engine_v14/evaluation_v14";
import { createNewGame, gameToString, makeMove } from "./engine_v14/model_v14";
import * as papa from "papaparse";
import { gameStrings } from "./gameStrings";

const engines = [
  engine14,
  engine15,
  engine16
]

const gameStringSet = new Set<string>(gameStrings)

export function playGame(firstPlayer: number, secondPlayer: number, maxDepth: number, msPerMove: number) {
  // returns game string describing the game played
  // first/second player refers to the index in the engines list

  const game = createNewGame(19)

  // keep track of position features for when it's player 0's turn, or player 1's turn
  const player0FeatureDicts: Record<string, number>[] = []
  const player1FeatureDicts: Record<string, number>[] = []

  // don't waste time analyzing first move, only one option
  const center = Math.floor(game.board.length / 2)
  makeMove(game, center, center)

  while (!game.isOver) {
    // get position features if game not forced win/loss
    const evaluation = evaluatePosition(game)
    if (Math.abs(evaluation) !== Infinity) {
      const featureDict = positionFeatureDict(game)
      game.currentPlayer === 0 ? player0FeatureDicts.push(featureDict) : player1FeatureDicts.push(featureDict)
    }
    // make move
    const engine = game.currentPlayer === 0 ? engines[firstPlayer] : engines[secondPlayer]
    const move = engine(game, maxDepth, msPerMove, false)
    makeMove(game, move[0], move[1])
  }

  // update feature dicts to include who won
  const winner = Number(!game.currentPlayer)
  for (const featureDict of player0FeatureDicts) {
    featureDict["won"] = (winner === 0 ? 1 : 0)
  }
  for (const featureDict of player1FeatureDicts) {
    featureDict["won"] = (winner === 1 ? 1 : 0)
  }

  return {
    winner: winner,
    gameString: gameToString(game),
    featureDicts: player0FeatureDicts.concat(player1FeatureDicts)
  }
}


export function runCompetition(engineA: number, engineB: number, nGames: number) {
  // engine A and B are indices in the engines array

  const winCounts = {
    "A": 0,
    "B": 0
  }
  const featureDictArray: Record<string, number>[] = []

  for (let i = 0; i < nGames; i++) {
    console.log("Game", i + 1)

    const engineAFirst = i % 2 === 0
    const result = engineAFirst ? playGame(engineA, engineB, 6, 100) : playGame(engineB, engineA, 6, 100)
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

    // add to feature dict data
    featureDictArray.push.apply(featureDictArray, result.featureDicts)
  }
  console.log(JSON.stringify(Array.from(gameStringSet.values()), null, 2))
  console.log(gameStringSet.size + " total games now")
  console.log(winCounts)
}



export function generateFeatureCSV(nFeaturesPerGame: number) {

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
    for (const [r, c] of moves) {
      makeMove(game, r, c)

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
