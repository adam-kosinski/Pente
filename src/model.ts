export const playerIndices = [0, 1] as const
export type PlayerIndex = typeof playerIndices[number]

export interface GameState {
    board: (number | undefined)[][]
    currentPlayer: PlayerIndex
    captures: Record<PlayerIndex, number>
}

export function makeMove(game: GameState, player: PlayerIndex, r: number, c: number){
    if (player !== game.currentPlayer) return
    if (r < 0 || r >= game.board.length || c < 0 || c >= game.board[0].length) return
    // can't go in a place with a piece
    if (game.board[r][c] !== undefined) return
    // enforce first move in the center
    const center_r = Math.floor(game.board.length / 2)
    const center_c = Math.floor(game.board.length / 2)
    if(game.board[center_r][center_c] === undefined && (r !== center_r || c !== center_c)) return

    console.log(`Player ${player} moves at row ${r}, col ${c}`)
    game.board[r][c] = player
    game.currentPlayer = playerIndices[(playerIndices.indexOf(game.currentPlayer) + 1) % playerIndices.length]
}