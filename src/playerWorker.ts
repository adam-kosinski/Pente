import { chooseMove, findBestMoves } from "./engine_v21/engine_v21";
import { type GameState } from "./engine_v21/model_v21";

onmessage = (e) => {
  const game = JSON.parse(e.data) as GameState;
  const move = chooseMove(game, 10, 1500);
  postMessage(move);
};
