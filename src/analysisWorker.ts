import { findBestMoves } from "./engine_v19/engine_v19";
import { type GameState } from "./engine_v19/model_v19";

onmessage = (e) => {
  const game = JSON.parse(e.data[0]) as GameState
  const nVariations = e.data[1]
  // update the main thread at each depth level
  console.profile()
  for (let d = 1; d < 10; d++) {
    const results = findBestMoves(game, nVariations, d, 3000, true)
    postMessage(results)
  }
  console.profileEnd()
}