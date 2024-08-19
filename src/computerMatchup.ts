import { chooseMove as engine0 } from "./engine_v14/engine_v14";
import { chooseMove as engine1 } from "./engine_v14/engine_v14";
import { evaluatePosition, positionFeatureDict } from "./engine_v14/evaluation_v14";
import { createNewGame, gameToString, makeMove } from "./engine_v14/model_v14";
import * as papa from "papaparse";

const engines = [
  engine0,
  engine1
]

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
    console.log(JSON.stringify(move))
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
  const gameStrings = new Set()
  const featureDictArray: Record<string, number>[] = []

  for (let i = 0; i < nGames; i++) {
    const engineAFirst = i % 2 === 0
    const result = engineAFirst ? playGame(engineA, engineB, 6, 100) : playGame(engineB, engineA, 6, 100)
    console.log(result.gameString)

    // don't count duplicate games
    if(gameStrings.has(result.gameString)){
      console.log("DUPLICATE!")
      continue
    }
    gameStrings.add(result.gameString)

    // tally who won
    if(engineAFirst && result.winner === 0 || !engineAFirst && result.winner === 1){
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

  console.log(winCounts)
  console.log(papa.unparse(featureDictArray))
}