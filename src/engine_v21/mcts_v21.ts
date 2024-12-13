import { copyGame, makeMove, type GameState } from "./model_v21";
import { makeOrderedMoveIterator } from "./move_generation_v21";

export function mctsRollout(gameArg: GameState) {
  const game = copyGame(gameArg); // TODO use undos in the future perhaps, but be clever about it so we don't undo too much when traversing the mcts tree
  while (!game.isOver) {
    const moveIterator = makeOrderedMoveIterator(game, 1);
    const { value: move } = moveIterator.next();
    if (!move) break;
    makeMove(game, move[0], move[1]);
  }
  return game;
}
