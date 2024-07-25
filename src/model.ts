import { updateLinearShapes } from "./engines/engine_v1"

export interface GameState {
  board: (number | null)[][]
  currentPlayer: 0 | 1
  captures: Record<0 | 1, number>
  nMoves: number
  linearShapes: LinearShape[]
}

// linear shape that's been located on the board
export interface LinearShape {
  type: string
  pattern: string
  goodFor: 0 | 1  // player that this shape helps
  begin: number[]
  end: number[]
  length: number
  hash: string  // generated by: [type, goodFor, begin, end].join()  - these 4 fields uniquely ID this
}


export function createNewGame(boardSize: number): GameState {
  const game = {
    board: [] as (number | null)[][],
    currentPlayer: 0 as 0 | 1,
    captures: { 0: 0, 1: 0 },
    nMoves: 0,
    linearShapes: []
  }
  for (let r = 0; r < boardSize; r++) {
    game.board.push(new Array(boardSize).fill(null))
  }
  return game
}


export function copyGame(game: GameState): GameState {
  return {
    board: game.board.map(row => row.slice()),
    currentPlayer: game.currentPlayer,
    captures: { ...game.captures },
    nMoves: game.nMoves,
    linearShapes: JSON.parse(JSON.stringify(game.linearShapes))
  }
}



export function makeMove(game: GameState, r: number, c: number) {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board[0].length) return
  // can't go in a place with a piece
  if (game.board[r][c] !== null) return
  // enforce first move in the center
  const center_r = Math.floor(game.board.length / 2)
  const center_c = Math.floor(game.board.length / 2)
  if (game.nMoves === 0 && (r !== center_r || c !== center_c)) return

  // place gemstone onto board
  game.board[r][c] = game.currentPlayer

  // check for capture of opponent pair(s)
  // iterate over directions
  for (let dx of [-1, 0, 1]) {
    for (let dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      // out of bounds check
      if (c + 3 * dx < 0 || c + 3 * dx >= game.board[0].length) continue;
      if (r + 3 * dy < 0 || r + 3 * dy >= game.board.length) continue;

      if (game.board[r + dy][c + dx] !== null &&
        game.board[r + dy][c + dx] !== game.currentPlayer &&
        game.board[r + dy][c + dx] === game.board[r + 2 * dy][c + 2 * dx] &&
        game.board[r + 3 * dy][c + 3 * dx] === game.currentPlayer) {

        game.board[r + dy][c + dx] = null
        game.board[r + 2 * dy][c + 2 * dx] = null
        game.captures[game.currentPlayer]++
      }
    }
  }

  updateLinearShapes(game, r, c)
  // TODO update for capture locations too
  console.log(game.linearShapes.map(x => x.hash).join("\n"))

  // update current player and move count
  game.currentPlayer = Number(!game.currentPlayer) as 0 | 1
  game.nMoves++
}