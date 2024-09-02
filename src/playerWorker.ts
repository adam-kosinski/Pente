import { chooseMove, findBestMoves } from "./engine_v20/engine_v20";
import { type GameState } from "./engine_v20/model_v20";

onmessage = (e) => {
  const game = JSON.parse(e.data) as GameState;
  const move = chooseMove(game, 10, 1500);
  postMessage(move);
};
