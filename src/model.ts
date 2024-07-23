export const playerIndices = [0, 1] as const
export type PlayerIndex = typeof playerIndices[number]

export interface GameState {
    board: (number | undefined)[][]
    currentPlayer: PlayerIndex
    captures: Record<PlayerIndex, number>
}

export function createNewGame(boardSize: number): GameState {
    const game = {
        board: [] as (number | undefined)[][],
        currentPlayer: playerIndices[0],
        captures: {} as Record<PlayerIndex, number>
    }
    for (let r = 0; r < boardSize; r++) {
        game.board.push(new Array(boardSize))
    }
    playerIndices.forEach(i => game.captures[i] = 0)

    return game
}

export function makeMove(game: GameState, player: PlayerIndex, r: number, c: number) {
    if (player !== game.currentPlayer) return
    if (r < 0 || r >= game.board.length || c < 0 || c >= game.board[0].length) return
    // can't go in a place with a piece
    if (game.board[r][c] !== undefined) return
    // enforce first move in the center
    const center_r = Math.floor(game.board.length / 2)
    const center_c = Math.floor(game.board.length / 2)
    if (game.board[center_r][center_c] === undefined && (r !== center_r || c !== center_c)) return

    // place gemstone onto board
    game.board[r][c] = player

    // check for capture of opponent pair(s)
    // iterate over directions
    for (let dx of [-1, 0, 1]) {
        for (let dy of [-1, 0, 1]) {
            if (dx === 0 && dy === 0) continue;
            // out of bounds check
            if (c + 3*dx < 0 || c + 3*dx >= game.board[0].length) continue;
            if (r + 3*dy < 0 || r + 3*dy >= game.board.length) continue;
            
            if (game.board[r + dy][c + dx] !== undefined &&
                game.board[r + dy][c + dx] !== game.currentPlayer &&
                game.board[r + dy][c + dx] === game.board[r + 2 * dy][c + 2 * dx] &&
                game.board[r + 3 * dy][c + 3 * dx] === game.currentPlayer) {

                game.board[r + dy][c + dx] = undefined
                game.board[r + 2 * dy][c + 2 * dx] = undefined
                game.captures[game.currentPlayer]++
            }
        }
    }

    // update current player
    game.currentPlayer = playerIndices[(playerIndices.indexOf(game.currentPlayer) + 1) % playerIndices.length]
}