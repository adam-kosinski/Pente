export interface GameState {
  board: Record<number, 0 | 1>[]
  currentPlayer: 0 | 1
  captures: Record<0 | 1, number>
  nMoves: number
  prevMoves: PrevMove[]
  isOver: boolean
  linearShapes: LinearShape[]
}

export interface PrevMove {
  addedGems: number[][]  // list of [r,c]
  removedGems: number[][]  // list of [r,c,player]
}

// linear shape that's been located on the board
export interface LinearShape {
  type: string
  pattern: string
  owner: 0 | 1  // player that "owns" this shape intuitively
  begin: number[]
  end: number[]
  length: number
  hash: string  // generated by: [type, owner, begin, end].join()  - these 4 fields uniquely ID this
}


export function createNewGame(boardSize: number): GameState {
  const game = {
    board: [],
    currentPlayer: 0 as 0 | 1,
    captures: { 0: 0, 1: 0 },
    nMoves: 0,
    prevMoves: [],
    isOver: false,
    linearShapes: []
  } as GameState
  for (let r = 0; r < boardSize; r++) {
    game.board.push({})
  }
  return game
}



export function makeMove(game: GameState, r: number, c: number) {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board.length) return
  // can't go in a place with a piece
  if (game.board[r][c] !== undefined) return
  // enforce first move in the center
  const center_r = Math.floor(game.board.length / 2)
  const center_c = Math.floor(game.board.length / 2)
  if (game.nMoves === 0 && (r !== center_r || c !== center_c)) return

  const prevMove: PrevMove = { addedGems: [], removedGems: [] }

  // place gemstone onto board
  game.board[r][c] = game.currentPlayer
  prevMove.addedGems.push([r,c])

  // check for capture of opponent pair(s)
  // iterate over directions
  for (let dx of [-1, 0, 1]) {
    for (let dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      // out of bounds check
      if (c + 3 * dx < 0 || c + 3 * dx >= game.board.length) continue;
      if (r + 3 * dy < 0 || r + 3 * dy >= game.board.length) continue;

      if (game.board[r + dy][c + dx] !== undefined &&
        game.board[r + dy][c + dx] !== game.currentPlayer &&
        game.board[r + dy][c + dx] === game.board[r + 2 * dy][c + 2 * dx] &&
        game.board[r + 3 * dy][c + 3 * dx] === game.currentPlayer) {

        delete game.board[r + dy][c + dx]
        delete game.board[r + 2 * dy][c + 2 * dx]
        prevMove.removedGems.push([r + dy, c + dx], [r + 2 * dy, c + 2 * dx])
        game.captures[game.currentPlayer]++
        // cleared stones may lead to new shapes
        updateLinearShapes(game, r + dy, c + dx)
        updateLinearShapes(game, r + 2 * dy, c + 2 * dx)
      }
    }
  }
  updateLinearShapes(game, r, c)
  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // check for game over
  if (game.captures[0] >= 5 || game.captures[1] >= 5 || game.linearShapes.some(shape => shape.type === "pente")) {
    game.isOver = true
  }

  // update variables
  game.prevMoves.push(prevMove)
  game.currentPlayer = Number(!game.currentPlayer) as 0 | 1
  game.nMoves++
}


export function undoMove(game: GameState) {
  const prevMove = game.prevMoves.pop()
  if (!prevMove) return

  const prevPlayer = Number(!game.currentPlayer) as 0 | 1  // useful to just compute once

  // remove added gems
  prevMove.addedGems.forEach(([r, c]) => {
    delete game.board[r][c]
  })
  // undo captures
  prevMove.removedGems.forEach(([r, c]) => {
    // current player is whose gems were just captured
    game.board[r][c] = game.currentPlayer
  })
  game.captures[prevPlayer] -= prevMove.removedGems.length / 2

  // update linear shapes
  prevMove.addedGems.forEach(([r, c]) => {
    updateLinearShapes(game, r, c)
  })
  prevMove?.removedGems.forEach(([r, c]) => {
    updateLinearShapes(game, r, c)
  })
  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // update other variables
  game.currentPlayer = prevPlayer
  game.nMoves -= 1
  game.isOver = false
}



const linearShapeDef = {
  // shapes are defined from the perspective of me as player 1 and opponent as player 0
  // shapes should be defined so that they are "owned" by player 1, intuitively
  // they will be automatically flipped by the code, so don't have to include both forwards/backwards versions of asymmetrical patterns
  // NOTE that if one of these is a prefix for another (i.e. share the same starting index), the one coming first in the list will be the only one found
  // - this is due to using one big union regex for better performance, and not really an issue as long as bigger threats are listed first in this list
  // - so generally, more pressing / threatening shapes should come first in this list
  "pente": "11111",
  "open-tessera": "_1111_",
  "pente-threat-4": "1111_",
  "pente-threat-31": "111_1",
  "pente-threat-22": "11_11",
  "open-tria": "_111_",
  "stretch-tria": "_11_1_",  // should be recognized instead of open pair
  "open-pair": "_11_",
  "capture-threat": "100_",
  "stretch-two": "_1_1_"
}

// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. 011_ for a capture threat
const linearShapes = new Map()
let maxLinearShapeLength = 0

for (const [type, pattern] of Object.entries(linearShapeDef)) {
  // add forward and backwards patterns
  linearShapes.set(pattern, { type: type, owner: 1, length: pattern.length })
  linearShapes.set(pattern.split("").reverse().join(""), { type: type, owner: 1, length: pattern.length })
  // do it for the other player
  const patternSwitchPlayers = pattern.replace(/1/g, "x").replace(/0/g, "1").replace(/x/g, "0")
  linearShapes.set(patternSwitchPlayers, { type: type, owner: 0, length: pattern.length })
  linearShapes.set(patternSwitchPlayers.split("").reverse().join(""), { type: type, owner: 0, length: pattern.length })
  // update max length
  maxLinearShapeLength = Math.max(pattern.length, maxLinearShapeLength)
}
const allPatternsRegEx = new RegExp("(?=(" + Array.from(linearShapes.keys()).join("|") + "))", "g")



export function updateLinearShapes(game: GameState, r0: number, c0: number) {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones

  // remove any shapes that are no longer there
  game.linearShapes = game.linearShapes.filter(shape => {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      const s = game.board[r][c] === undefined ? "_" : String(game.board[r][c])
      if (s !== shape.pattern[i]) return false
    }
    return true
  })

  // add new shapes

  // iterate over each of four directions
  for (const dir of [[0, 1], [1, 0], [1, 1], [-1, 1]]) { // row, col, (\) diagonal, (/) diagonal
    let s = ""
    let rInit = r0 - (maxLinearShapeLength - 1) * dir[0]
    let cInit = c0 - (maxLinearShapeLength - 1) * dir[1]
    for (let i = 0, r = rInit, c = cInit; i < 2 * maxLinearShapeLength - 1; i++, r += dir[0], c += dir[1]) {
      // if off the side of the board, add a blocker character that won't match anything, to keep the indexing correct
      if (r < 0 || c < 0 || r >= game.board.length || c >= game.board.length) {
        s += "x"
        continue
      }
      const value = game.board[r][c]
      s += value === undefined ? "_" : value
    }
    // search for each pattern
    for (const match of s.matchAll(allPatternsRegEx)) {
      const pattern: string = match[1]
      const patternInfo = linearShapes.get(pattern)
      const shape: LinearShape = {
        type: patternInfo.type,
        pattern: pattern,
        owner: patternInfo.owner,
        begin: [
          rInit + dir[0] * match.index,
          cInit + dir[1] * match.index
        ],
        end: [  // inclusive index
          rInit + dir[0] * (match.index + patternInfo.length - 1),
          cInit + dir[1] * (match.index + patternInfo.length - 1)
        ],
        length: patternInfo.length,
        hash: ""  // placeholder, see below
      }
      shape.hash = [shape.type, shape.owner, shape.begin, shape.end].join()
      if (!game.linearShapes.some(existingShape => existingShape.hash === shape.hash)) {
        game.linearShapes.push(shape)
      }
    }
  }
}