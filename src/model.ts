import { transpositionTable, TTableKey, type TTEntry } from "@/engines/engine_v7"

export interface GameState {
  board: Record<number, 0 | 1>[]
  currentPlayer: 0 | 1
  captures: Record<0 | 1, number>
  nMoves: number
  prevMoves: MoveInfo[]
  isOver: boolean
  linearShapes: LinearShape[]
  TTKey?: string  // key for transposition table, we don't need/want to calculate for every position so it is optional
}

export interface MoveInfo {
  addedGems: number[][]  // list of [r,c]
  removedGems: number[][]  // list of [r,c,player]
  linearShapeUpdate: LinearShapeUpdate
}
export interface LinearShapeUpdate {
  added: LinearShape[]
  removed: LinearShape[]
}

// linear shape that's been located on the board
// this is readonly b/c there's no reason to change it, and because there might be multiple references to the same LinearShape object
// (e.g. transposition table, re-using game state object when searching)
export interface LinearShape {
  readonly type: string
  readonly pattern: string
  readonly owner: 0 | 1  // player that "owns" this shape intuitively
  readonly begin: number[]
  readonly end: number[]
  readonly length: number
  readonly hash: string  // generated by: [type, owner, begin, end].join()  - these 4 fields uniquely ID this
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



export function makeMove(game: GameState, r: number, c: number, updateTTKey: boolean = true) {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board.length) return
  // can't go in a place with a piece
  if (game.board[r][c] !== undefined) return
  // enforce first move in the center
  const center_r = Math.floor(game.board.length / 2)
  const center_c = Math.floor(game.board.length / 2)
  if (game.nMoves === 0 && (r !== center_r || c !== center_c)) return

  const shapeUpdate: LinearShapeUpdate = { added: [], removed: [] }  // easier to reference as a separate variable from prevMove
  const moveInfo: MoveInfo = { addedGems: [], removedGems: [], linearShapeUpdate: shapeUpdate }

  // place gemstone onto board
  game.board[r][c] = game.currentPlayer
  moveInfo.addedGems.push([r, c])

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
        moveInfo.removedGems.push([r + dy, c + dx], [r + 2 * dy, c + 2 * dx])
        game.captures[game.currentPlayer]++
      }
    }
  }
  // update other variables
  game.prevMoves.push(moveInfo)
  game.currentPlayer = Number(!game.currentPlayer) as 0 | 1
  game.nMoves++
  // check for game over
  if (game.captures[0] >= 5 || game.captures[1] >= 5 || game.linearShapes.some(shape => shape.type === "pente")) {
    game.isOver = true
  }

  // now that we've changed the board position and player, update the TTKey
  let tableEntry: TTEntry | undefined = undefined
  if (updateTTKey) {
    game.TTKey = TTableKey(game)
    tableEntry = transpositionTable.get(game.TTKey)
  }
  else { delete game.TTKey }

  // update linear shapes; do after TTKey calculations so we can use the table entry if we have it to avoid expensive recomputation
  moveInfo.addedGems.concat(moveInfo.removedGems).forEach(([r, c]) => {
    const update = updateLinearShapes(game, r, c)
    shapeUpdate.added = shapeUpdate.added.concat(update.added)
    shapeUpdate.removed = shapeUpdate.removed.concat(update.removed)
  })
  // console.log("added", shapeUpdate.added.map(s => s.hash))
  // console.log("removed", shapeUpdate.removed.map(s => s.hash))
  // console.log(game.linearShapes.map(s => s.hash).join("\n"))




}


export function undoMove(game: GameState, updateTTKey: boolean = true) {
  const prevMove = game.prevMoves.pop()
  if (!prevMove) return

  const prevPlayer = Number(!game.currentPlayer) as 0 | 1  // useful to just compute once

  // remove added gems
  prevMove.addedGems.forEach(([r, c]) => {
    delete game.board[r][c]
  })
  // undo captures
  game.captures[prevPlayer] -= prevMove.removedGems.length / 2
  prevMove.removedGems.forEach(([r, c]) => {
    game.board[r][c] = game.currentPlayer   // current player is whose gems were just captured
  })

  // remove added linear shapes
  const addedHashes = prevMove.linearShapeUpdate.added.map(shape => shape.hash)
  game.linearShapes = game.linearShapes.filter(shape => !addedHashes.includes(shape.hash))
  // add removed linear shapes
  prevMove.linearShapeUpdate.removed.forEach(shape => game.linearShapes.push(shape))

  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  if (updateTTKey) game.TTKey = TTableKey(game)
  else { delete game.TTKey }

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



export function updateLinearShapes(game: GameState, r0: number, c0: number): LinearShapeUpdate {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones

  const update: LinearShapeUpdate = { added: [], removed: [] }

  // remove any shapes that are no longer there
  game.linearShapes = game.linearShapes.filter(shape => {
    const dy = Math.sign(shape.end[0] - shape.begin[0])
    const dx = Math.sign(shape.end[1] - shape.begin[1])
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      const s = game.board[r][c] === undefined ? "_" : String(game.board[r][c])
      if (s !== shape.pattern[i]) {
        update.removed.push(shape)
        return false
      }
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
      const begin = [
        rInit + dir[0] * match.index,
        cInit + dir[1] * match.index
      ]
      const end = [  // inclusive index
        rInit + dir[0] * (match.index + patternInfo.length - 1),
        cInit + dir[1] * (match.index + patternInfo.length - 1)
      ]
      const shape: LinearShape = {
        type: patternInfo.type,
        pattern: pattern,
        owner: patternInfo.owner,
        begin: begin,
        end: end,
        length: patternInfo.length,
        hash: [patternInfo.type, patternInfo.owner, begin, end].join()
      }
      if (!game.linearShapes.some(existingShape => existingShape.hash === shape.hash)) {
        game.linearShapes.push(shape)
        update.added.push(shape)
      }
    }
  }
  return update
}