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
    // if found a forced win, don't bother looking deeper
    if(results[0].valid && Math.abs(results[0].eval) === Infinity) break
  }
  console.profileEnd()
}