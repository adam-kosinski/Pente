export class Game {
  board: i32[][] = []  // value is 0 or 1, or -1 if empty
  currentPlayer: i32 = 0  // 0 or 1
  captures: i32[] = [0, 0]  // key is player, value is n captures
  nMoves: i32 = 0
  prevMoves: MoveInfo[] = []
  isOver: boolean = false
  linearShapes: LinearShape[] = []

  constructor(boardSize: i32) {
    for (let r: i32 = 0; r < boardSize; r++) {
      const row: i32[] = []
      for (let c: i32 = 0; c < boardSize; c++) {
        row.push(-1)
      }
      this.board.push(row)
    }
  }
}

export class MoveInfo {
  addedGems: i32[][] = []  // list of [r,c]
  removedGems: i32[][] = []  // list of [r,c,player]
  linearShapeUpdate: LinearShapeUpdate = new LinearShapeUpdate()
}
export class LinearShapeUpdate {
  added: LinearShape[] = []
  removed: LinearShape[] = []
}

// linear shape that's been located on the board
// this is readonly b/c there's no reason to change it, and because there might be multiple references to the same LinearShape object
// (e.g. transposition table, re-using game state object when searching)
export interface LinearShape {
  readonly type: string
  readonly pattern: string
  readonly owner: i32  // 0 or 1, player that "owns" this shape intuitively
  readonly begin: i32[]
  readonly end: i32[]
  readonly length: i32
  readonly hash: string  // generated by: [type, owner, begin, end].join()  - these 4 fields uniquely ID this
}

export interface SearchResult {
  eval: i32
  evalFlag: EvalFlag
  bestVariation: i32[][]
}
export type EvalFlag = "exact" | "upper-bound" | "lower-bound"


export function gameToString(game: Game): string {
  return `${game.board.length}~${game.prevMoves.map((m: MoveInfo) => m.addedGems[0].join(".")).join("|")}`
}
export function loadFromString(s: string): Game {
  const split = s.split("~")
  const boardSize = i32(parseInt(split[0]))
  const moves = split[1].split("|").map((m: string) => m.split(".").map((x: string) => i32(parseInt(x))))
  const game = new Game(boardSize)
  for(let i=0; i<moves.length; i++){
    makeMove(game, moves[i][0], moves[i][1])
  }
  return game
}



export function makeMove(game: Game, r: i32, c: i32): void {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board.length) return
  // can't go in a place with a piece
  if (game.board[r][c] !== -1) return
  // enforce first move in the center
  const center_r = Math.floor(game.board.length / 2)
  const center_c = Math.floor(game.board.length / 2)
  if (game.nMoves === 0 && (r !== center_r || c !== center_c)) return

  const moveInfo: MoveInfo = new MoveInfo()
  const shapeUpdate = moveInfo.linearShapeUpdate

  // place gemstone onto board
  game.board[r][c] = game.currentPlayer
  moveInfo.addedGems.push([r, c])

  // check for capture of opponent pair(s)
  // iterate over directions
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      // out of bounds check
      if (c + 3 * dx < 0 || c + 3 * dx >= game.board.length) continue;
      if (r + 3 * dy < 0 || r + 3 * dy >= game.board.length) continue;

      if (game.board[r + dy][c + dx] !== -1 &&
        game.board[r + dy][c + dx] !== game.currentPlayer &&
        game.board[r + dy][c + dx] === game.board[r + 2 * dy][c + 2 * dx] &&
        game.board[r + 3 * dy][c + 3 * dx] === game.currentPlayer) {

        game.board[r + dy][c + dx] = -1
        game.board[r + 2 * dy][c + 2 * dx] = -1
        moveInfo.removedGems.push([r + dy, c + dx])
        moveInfo.removedGems.push([r + 2 * dy, c + 2 * dx])
        game.captures[game.currentPlayer]++
      }
    }
  }
  // update linear shapes for all the locations we messed with
  const changedLocations = moveInfo.addedGems.concat(moveInfo.removedGems)
  for(let i=0; i<changedLocations.length; i++){
    const update: LinearShapeUpdate = updateLinearShapes(game, changedLocations[i][0], changedLocations[i][1])
    shapeUpdate.added = shapeUpdate.added.concat(update.added)
    shapeUpdate.removed = shapeUpdate.removed.concat(update.removed)
  }
  // console.log("added", shapeUpdate.added.map(s => s.hash))
  // console.log("removed", shapeUpdate.removed.map(s => s.hash))
  // console.log(game.linearShapes.map(s => s.hash).join("\n"))


  // check for game over
  if (game.captures[0] >= 5 || game.captures[1] >= 5 || game.linearShapes.some(shape => shape.type === "pente")) {
    game.isOver = true
  }

  // update variables
  game.prevMoves.push(moveInfo)
  game.currentPlayer = game.currentPlayer === 0 ? 1 : 0
  game.nMoves++
}




export function undoMove(game: Game): void {
  const prevMove = game.prevMoves.pop()
  if (!prevMove) return

  const prevPlayer = game.currentPlayer === 0 ? 1 : 0  // useful to just compute once

  // remove added gems
  for(let i=0; i<prevMove.addedGems.length; i++){
    const x = prevMove.addedGems[i]
    game.board[x[0]][x[1]] = -1
  }
  // undo captures
  game.captures[prevPlayer] -= prevMove.removedGems.length / 2
  for(let i=0; i<prevMove.removedGems.length; i++){
    const x = prevMove.removedGems[i]
    game.board[x[0]][x[1]] = game.currentPlayer  // current player is whose gems were just captured
  }

  // remove added linear shapes
  const addedHashes = prevMove.linearShapeUpdate.added.map((shape: LinearShape) => shape.hash)
  for(let i=0; i<game.linearShapes.length; i++){
    if(!addedHashes.includes(game.linearShapes[i].hash)){
      game.linearShapes.splice(i, 1)
      i--
    }
  }
  // add removed linear shapes
  const removed = prevMove.linearShapeUpdate.removed
  for(let i=0; i<removed.length; i++){
    game.linearShapes.push(removed[i])
  }

  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // update other variables
  game.currentPlayer = prevPlayer
  game.nMoves -= 1
  game.isOver = false
}

/*

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
  "extendable-tria": "0111__",
  "extendable-stretch-tria": "01_11_",
  "extendable-stretch-tria-threatened": "011_1_",  // recognized instead of capture threat
  "open-pair": "_11_",
  "capture-threat": "100_",
  "stretch-two": "_1_1_",
  "double-stretch-two": "_1__1_"
}

// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. 011_ for a capture threat
export const linearShapes = new Map()
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


export function updateLinearShapes(game: Game, r0: number, c0: number): LinearShapeUpdate {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones

  const update: LinearShapeUpdate = { added: [], removed: [] }

  // remove any shapes that are no longer there - takes about 30% of time
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

  
  // add new shapes - takes about 70% of time

  const existingShapeHashes = new Set(game.linearShapes.map(s => s.hash))

  // iterate over each of four directions
  for (const dir of [[0, 1], [1, 0], [1, 1], [-1, 1]]) { // row, col, (\) diagonal, (/) diagonal
    // construct string to search for patterns in - takes about 50% of time
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

    // search for each pattern - takes about 20% of time
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
      if (!existingShapeHashes.has(shape.hash)) {
        game.linearShapes.push(shape)
        existingShapeHashes.add(shape.hash)
        update.added.push(shape)
      }
    }
  }
  return update
}
  */