import { chooseMove, findBestMoves } from "./engine_v19/engine_v19";
import { type GameState } from "./engine_v19/model_v19";

onmessage = (e) => {
  const game = JSON.parse(e.data) as GameState
  const move = chooseMove(game, 10, 1500)
  postMessage(move)
}