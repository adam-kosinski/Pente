import { findBestMoves } from "./engine_v21/engine_v21";
import { type GameState } from "./engine_v21/model_v21";

onmessage = (e) => {
  const game = JSON.parse(e.data[0]) as GameState;
  const nVariations = e.data[1];
  // update the main thread at each depth level
  console.profile();
  const results = findBestMoves(
    game,
    nVariations,
    10, // max depth
    3000, // max time in ms
    true, // absolute eval
    true, // verbose
    postMessage // provide callback to send intermediate results
  );
  postMessage(results);
  console.profileEnd();
};
