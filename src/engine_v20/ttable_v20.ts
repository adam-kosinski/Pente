import { type GameState, type SearchResult } from "./model_v20";

// transposition table - key comes from TTableKey(game) function below
export interface TTEntry {
  depth: number;
  result: SearchResult;
}
export const transpositionTable: Map<string, TTEntry> = new Map();
const maxTTableEntries = 200000;

export function TTableKey(game: GameState, usingNullWindow: boolean) {
  let key = String(game.currentPlayer);
  for (const row of game.board) {
    for (const col in row) {
      key += col + row[col] + ",";
    }
    key += ".";
  }
  if (usingNullWindow) key += "-null";
  return key;
}
export function transpositionTableSet(
  game: GameState,
  result: SearchResult,
  depth: number,
  usingNullWindow: boolean
) {
  const entry: TTEntry = {
    depth: depth,
    result: result,
  };
  if (transpositionTable.size === maxTTableEntries) {
    // remove the oldest entry to make space
    const oldKey = transpositionTable.keys().next().value;
    transpositionTable.delete(oldKey);
  }
  transpositionTable.set(TTableKey(game, usingNullWindow), entry);
}
