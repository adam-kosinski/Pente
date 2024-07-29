import { type GameState, type SearchResult } from "./model_v11"


// transposition table - key comes from TTableKey(game) function below
export interface TTEntry {
  depth: number
  fromQuiescentSearch: boolean
  result: SearchResult
}
export const transpositionTable: Map<string, TTEntry> = new Map()
const maxTTableEntries = 20000

export function TTableKey(game: GameState) {
  let key = String(game.currentPlayer)
  game.board.forEach(row => {
    for (const col in row) {
      key += col + row[col] + ","
    }
    key += "."
  })
  return key
}
export function transpositionTableSet(game: GameState, result: SearchResult, depth: number, fromQuiescentSearch: boolean) {
  const entry: TTEntry = {
    depth: depth,
    fromQuiescentSearch: fromQuiescentSearch,
    result: result
  }
  if (transpositionTable.size === maxTTableEntries) {
    // remove the oldest entry to make space
    const oldKey = transpositionTable.keys().next().value
    transpositionTable.delete(oldKey)
  }
  transpositionTable.set(TTableKey(game), entry)
}