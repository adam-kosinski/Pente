import { findBestMoves } from "./engine_v21";
import { copyGame, makeMove, type GameState } from "./model_v21";
import { makeOrderedMoveIterator } from "./move_generation_v21";

export function mctsRollout_v1(gameArg: GameState) {
  const game = copyGame(gameArg); // TODO use undos in the future perhaps, but be clever about it so we don't undo too much when traversing the mcts tree
  while (!game.isOver) {
    const moveIterator = makeOrderedMoveIterator(game, 1);
    const { value: move } = moveIterator.next();
    if (!move) break;
    makeMove(game, move[0], move[1]);
  }
  return game;
}

export function mctsRollout(gameArg: GameState) {
  const game = copyGame(gameArg); // TODO use undos in the future perhaps, but be clever about it so we don't undo too much when traversing the mcts tree
  while (!game.isOver) {
    const result = findBestMoves(game, 2, 3);
    let move = result[0].bestVariation[0];
    if (result[1] && Math.random() < 0.25) {
      move = result[1].bestVariation[0];
    }
    makeMove(game, move[0], move[1]);
  }
  return game;
}
