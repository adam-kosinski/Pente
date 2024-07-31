import { Game, type SearchResult } from "./model_v13_wasm"


// transposition table - key comes from TTableKey(game) function below
export interface TTEntry {
  depth: number
  result: SearchResult
}
export const transpositionTable: Map<string, TTEntry> = new Map()
const maxTTableEntries = 20000

export function TTableKey(game: Game) {
  let key = String(game.currentPlayer)
  game.board.forEach(row => {
    for (const col in row) {
      key += col + row[col] + ","
    }
    key += "."
  })
  return key
}
export function transpositionTableSet(game: Game, result: SearchResult, depth: number) {
  const entry: TTEntry = {
    depth: depth,
    result: result
  }
  if (transpositionTable.size === maxTTableEntries) {
    // remove the oldest entry to make space
    const oldKey = transpositionTable.keys().next().value
    transpositionTable.delete(oldKey)
  }
  transpositionTable.set(TTableKey(game), entry)
}