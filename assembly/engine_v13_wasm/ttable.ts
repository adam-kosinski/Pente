import { Game, SearchResult, TTEntry } from "./model"


// transposition table - key comes from TTableKey(game) function below

export const transpositionTable: Map<string, TTEntry> = new Map()
const maxTTableEntries = 20000

export function TTableKey(game: Game): string {
  let key = game.currentPlayer.toString()

  for(let r=0; r<game.board.length; r++){
    for(let c=0; c<game.board.length; c++){
      key += game.board[r][c].toString()
    }
  }
  return key
}

export function transpositionTableSet(game: Game, result: SearchResult, depth: number): void {
  const entry: TTEntry = {
    depth: depth,
    result: result
  }
  if (transpositionTable.size === maxTTableEntries) {
    // remove the oldest entry to make space
    const oldKey: string = transpositionTable.keys()[0]
    transpositionTable.delete(oldKey)
  }
  transpositionTable.set(TTableKey(game), entry)
}