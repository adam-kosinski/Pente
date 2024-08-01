import { Game, MoveInfo, LinearShapeUpdate, LinearShape, createLinearShape } from "./model"

export function main(): void { }

export function gameToString(game: Game): string {
  return `${game.board.length}~${game.prevMoves.map((m: MoveInfo) => m.addedGems[0].join(".")).join("|")}`
}
export function loadFromString(s: string): Game {
  const split = s.split("~")
  const boardSize = i32(parseInt(split[0]))
  const moves: i32[][] = split[1].split("|").map((m: string) => m.split(".").map((x: string) => i32(parseInt(x))))
  const game = createNewGame(boardSize)
  for (let i = 0; i < moves.length; i++) {
    makeMove(game, moves[i][0], moves[i][1])
  }
  return game
}

export function createNewGame(boardSize: i32): Game {
  const game = new Game()
  for (let r: i32 = 0; r < boardSize; r++) {
    const row: i32[] = []
    for (let c: i32 = 0; c < boardSize; c++) {
      row.push(-1)
    }
    game.board.push(row)
  }
  return game
}


export function copyGame(game: Game): Game {
  // inefficient but simple copying technique
  // this function isn't used frequently so being inefficient is fine
  return loadFromString(gameToString(game))
}



export function makeMove(game: Game, r: i32, c: i32): Game {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board.length) return game
  // can't go in a place with a piece
  if (game.board[r][c] !== -1) return game
  // enforce first move in the center
  const center_r = Math.floor(game.board.length / 2)
  const center_c = Math.floor(game.board.length / 2)
  if (game.nMoves === 0 && (r !== center_r || c !== center_c)) return game

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
  for (let i = 0; i < changedLocations.length; i++) {
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

  return game  // for convenience
}




export function undoMove(game: Game): Game {
  const prevMove = game.prevMoves.pop()
  if (!prevMove) return game

  const prevPlayer = game.currentPlayer === 0 ? 1 : 0  // useful to just compute once

  // remove added gems
  for (let i = 0; i < prevMove.addedGems.length; i++) {
    const x = prevMove.addedGems[i]
    game.board[x[0]][x[1]] = -1
  }
  // undo captures
  game.captures[prevPlayer] -= prevMove.removedGems.length / 2
  for (let i = 0; i < prevMove.removedGems.length; i++) {
    const x = prevMove.removedGems[i]
    game.board[x[0]][x[1]] = game.currentPlayer  // current player is whose gems were just captured
  }

  // remove added linear shapes
  const addedHashes = prevMove.linearShapeUpdate.added.map((shape: LinearShape) => shape.hash)
  const filteredLinearShapes: LinearShape[] = []
  for (let i = 0; i < game.linearShapes.length; i++) {
    if (!addedHashes.includes(game.linearShapes[i].hash)) {
      filteredLinearShapes.push(game.linearShapes[i])
    }
  }
  game.linearShapes = filteredLinearShapes

  // add removed linear shapes
  const removed = prevMove.linearShapeUpdate.removed
  for (let i = 0; i < removed.length; i++) {
    game.linearShapes.push(removed[i])
  }

  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // update other variables
  game.currentPlayer = prevPlayer
  game.nMoves -= 1
  game.isOver = false

  return game
}



const linearShapeDef: string[][] = [
  // shapes are defined from the perspective of me as player 1 and opponent as player 0
  // shapes should be defined so that they are "owned" by player 1, intuitively
  // they will be automatically flipped by the code, so don't have to include both forwards/backwards versions of asymmetrical patterns
  // NOTE that if one of these is a prefix for another (i.e. share the same starting index), the one coming first in the list will be the only one found
  // - this is due to using one big union regex for better performance, and not really an issue as long as bigger threats are listed first in this list
  // - so generally, more pressing / threatening shapes should come first in this list
  ["pente", "11111"],
  ["open-tessera", "_1111_"],
  ["pente-threat-4", "1111_"],
  ["pente-threat-31", "111_1"],
  ["pente-threat-22", "11_11"],
  ["open-tria", "_111_"],
  ["stretch-tria", "_11_1_"],  // should be recognized instead of open pair
  ["extendable-tria", "0111__"],
  ["extendable-stretch-tria", "01_11_"],
  ["extendable-stretch-tria-threatened", "011_1_"],  // recognized instead of capture threat
  ["open-pair", "_11_"],
  ["capture-threat", "100_"],
  ["stretch-two", "_1_1_"],
  ["double-stretch-two", "_1__1_"]
]

class LinearShapeInfo {
  type: string = ""
  owner: i32 = 0
  length: i32 = 0
}

// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. 011_ for a capture threat
const linearShapes: Map<string, LinearShapeInfo> = new Map()
let maxLinearShapeLength = 0

for (let i = 0; i < linearShapeDef.length; i++) {
  const type = linearShapeDef[i][0]
  const pattern = linearShapeDef[i][1]
  // add forward and backwards patterns
  linearShapes.set(pattern, { type: type, owner: 1, length: pattern.length })
  linearShapes.set(pattern.split("").reverse().join(""), { type: type, owner: 1, length: pattern.length })
  // do it for the other player
  const patternSwitchPlayers = pattern.replaceAll("1", "x").replaceAll("0", "1").replace("x", "0")
  linearShapes.set(patternSwitchPlayers, { type: type, owner: 0, length: pattern.length })
  linearShapes.set(patternSwitchPlayers.split("").reverse().join(""), { type: type, owner: 0, length: pattern.length })
  // update max length
  maxLinearShapeLength = i32(Math.max(pattern.length, maxLinearShapeLength))
}



class Match {
  index: i32
  pattern: string
  constructor(index: i32, pattern: string) {
    this.index = index
    this.pattern = pattern
  }
}


// map to memoize linear shape pattern matches
const patternMatchMap: Map<string, Match[]> = new Map()

export function getPatternMatches(str: string): Match[] {
  if (patternMatchMap.has(str)) return patternMatchMap.get(str) || []

  const matches: Match[] = []
  const patterns = linearShapes.keys()
  for (let p = 0; p < patterns.length; p++) {
    const pattern = patterns[p]
    for (let start = 0; start <= str.length - pattern.length; start++) {
      let matchHere = true
      for (let i = 0; i < pattern.length; i++) {
        if (str.charAt(start + i) !== pattern.charAt(i)) {
          matchHere = false
          break
        }
      }
      if (matchHere) {
        matches.push(new Match(start, pattern))
      }
    }
  }
  patternMatchMap.set(str, matches);
  return matches
}



export function updateLinearShapes(game: Game, r0: number, c0: number): LinearShapeUpdate {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones

  const update: LinearShapeUpdate = new LinearShapeUpdate()

  // remove any shapes that are no longer there

  const filteredLinearShapes: LinearShape[] = []

  for (let n = 0; n < game.linearShapes.length; n++) {
    const shape = game.linearShapes[n]
    const dy = i32(Math.sign(shape.end[0] - shape.begin[0]))
    const dx = i32(Math.sign(shape.end[1] - shape.begin[1]))
    let stillThere = true
    for (let i = 0, r = shape.begin[0], c = shape.begin[1]; i < shape.length; i++, r += dy, c += dx) {
      const s = game.board[r][c] === -1 ? "_" : game.board[r][c].toString()
      if (s !== shape.pattern.charAt(i)) {
        update.removed.push(shape)
        stillThere = false
      }
    }
    if (stillThere) filteredLinearShapes.push(shape)
  }

  game.linearShapes = filteredLinearShapes


  // add new shapes - takes about 70% of time

  const existingShapeHashes: Set<string> = new Set()
  for (let i = 0; i < game.linearShapes.length; i++) {
    existingShapeHashes.add(game.linearShapes[i].hash)
  }

  // iterate over each of four directions
  const dirs: i32[][] = [[0, 1], [1, 0], [1, 1], [-1, 1]]
  for (let d = 0; d < dirs.length; d++) { // row, col, (\) diagonal, (/) diagonal
    const dir = dirs[d]

    // construct string to search for patterns in - takes about 50% of time
    let s: string = ""
    let rInit: i32 = i32(r0 - (maxLinearShapeLength - 1) * dir[0])
    let cInit: i32 = i32(c0 - (maxLinearShapeLength - 1) * dir[1])
    for (let i = 0, r = rInit, c = cInit; i < 2 * maxLinearShapeLength - 1; i++, r += dir[0], c += dir[1]) {
      // if off the side of the board, add a blocker character that won't match anything, to keep the indexing correct
      if (r < 0 || c < 0 || r >= game.board.length || c >= game.board.length) {
        s += "x"
        continue
      }
      const value = game.board[r][c]
      s += value === -1 ? "_" : value.toString()
    }

    // search for each pattern
    const matches: Match[] = getPatternMatches(s)
    if (!matches) continue
    for (let i = 0; i < matches.length; i++) {
      const pattern: string = matches[i].pattern
      const patternInfo = linearShapes.get(pattern)
      if (!patternInfo) continue
      const begin = [
        rInit + dir[0] * matches[i].index,
        cInit + dir[1] * matches[i].index
      ]
      const end = [  // inclusive index
        rInit + dir[0] * (matches[i].index + patternInfo.length - 1),
        cInit + dir[1] * (matches[i].index + patternInfo.length - 1)
      ]
      const shape = createLinearShape(patternInfo.type, pattern, patternInfo.owner, begin, end)
      if (!existingShapeHashes.has(shape.hash)) {
        game.linearShapes.push(shape)
        existingShapeHashes.add(shape.hash)
        update.added.push(shape)
      }
    }
  }
  return update
}



export function testShapeUpdate(): void {
  const game = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11")
  const iterations = 10000
  let start = performance.now()
  for (let i = 0; i < iterations; i++) {
    updateLinearShapes(game, 10, 10)
  }
  console.log("A:" + (performance.now() - start).toString() + " ms")
}