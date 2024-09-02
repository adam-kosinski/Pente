import { findBestMoves } from "./engine_v20/engine_v20";
import { type GameState } from "./engine_v20/model_v20";

onmessage = (e) => {
  const game = JSON.parse(e.data[0]) as GameState;
  const nVariations = e.data[1];
  // update the main thread at each depth level
  console.profile();
  for (let d = 1; d < 10; d++) {
    const start = performance.now();
    const results = findBestMoves(game, nVariations, d, 3000, true);
    postMessage(results);
    // if ran out of time that iteration, don't keep looking, same thing will happen
    if (performance.now() - start > 3000) break;
    // if found a forced win, don't bother looking deeper
    if (results[0].valid && Math.abs(results[0].eval) === Infinity) break;
  }
  console.profileEnd();
};
