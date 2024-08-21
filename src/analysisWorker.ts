import { findBestMoves } from "./engine_v18/engine_v18";
import { gameToString, type GameState } from "./engine_v18/model_v18";

onmessage = (e) => {
  console.log("analyze!")
  const game = JSON.parse(e.data) as GameState

  for (let d = 1; d < 10; d++) {
    const results = findBestMoves(game, 2, d, 3000)
    postMessage(results)
  }
}