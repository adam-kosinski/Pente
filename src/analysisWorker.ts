import { findBestMoves } from "./engine_v18/engine_v18";
import { type GameState } from "./engine_v18/model_v18";

onmessage = (e) => {
  const game = JSON.parse(e.data) as GameState
  // update the main thread at each depth level
  for (let d = 1; d < 10; d++) {
    const results = findBestMoves(game, 2, d, 3000, true)
    postMessage(results)
  }
}