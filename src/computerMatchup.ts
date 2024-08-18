import { chooseMove as engine1 } from "./engine_v14/engine_v14";
import { chooseMove as engine2 } from "./engine_v14/engine_v14";
import { createNewGame, gameToString, makeMove } from "./engine_v14/model_v14";

const engines = [
  engine1,
  engine2
]

export function playGame(firstPlayer: number, secondPlayer: number, maxDepth: number, msPerMove: number){
  // first/second player refers to the index in the engines list
  const game = createNewGame(19)

  // don't waste time analyzing first move, only one option
  const center = Math.floor(game.board.length / 2)
  makeMove(game, center, center)
  
  while(!game.isOver){
    const engine = game.currentPlayer === 0 ? engines[firstPlayer] : engines[secondPlayer]
    const move = engine(game, maxDepth, msPerMove, false)
    console.log(JSON.stringify(move))
    makeMove(game, move[0], move[1])
  }

  // window.location.href = "/analyze?s=" + gameToString(game)
  console.log(gameToString(game))
}