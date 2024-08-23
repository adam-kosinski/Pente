import { findBestMoves } from "./engine_v19/engine_v19";
import { type GameState } from "./engine_v19/model_v19";

onmessage = (e) => {
  const game = JSON.parse(e.data) as GameState
  const results = findBestMoves(game, 1, 10, 1500, false)
  postMessage(results[0].bestVariation[0])
}