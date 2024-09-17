export interface GameState {
  board: Record<number, 0 | 1>[];
  currentPlayer: 0 | 1;
  captures: Record<0 | 1, number>;
  nMoves: number;
  prevMoves: MoveInfo[];
  isOver: boolean;
  linearShapes: LinearShape[];
  threatHistory: number[]; // number of forcing threats (pente threats or trias) made on each move of the game, used to track momentum
}

export interface MoveInfo {
  addedGems: number[][]; // list of [r,c]
  removedGems: number[][]; // list of [r,c,player]
  linearShapeUpdate: LinearShapeUpdate;
}
export interface LinearShapeUpdate {
  added: LinearShape[];
  removed: LinearShape[];
}

// general shape interface is less detailed than the LinearShape one, because we only really care that nonlinear shapes exist (for evaluation),
// but linear shapes are used for move and threat generation, etc.
export interface Shape {
  readonly type: string;
  readonly owner: 0 | 1; // player that "owns" this shape intuitively
}

// linear shape that's been located on the board
// this is readonly b/c there's no reason to change it, and because there might be multiple references to the same LinearShape object
// (e.g. transposition table, re-using game state object when searching)
export interface LinearShape extends Shape {
  readonly pattern: string;
  readonly begin: number[];
  readonly dy: number;
  readonly dx: number;
  readonly length: number;
  readonly hash: string;
}

export interface SearchResult {
  eval: number; // NaN indicates ran out of time
  evalFlag: EvalFlag;
  bestVariation: number[][];
  valid: boolean;
}
export type EvalFlag = "exact" | "upper-bound" | "lower-bound";

export function createNewGame(boardSize: number): GameState {
  const game = {
    board: [],
    currentPlayer: 0 as 0 | 1,
    captures: { 0: 0, 1: 0 },
    nMoves: 0,
    prevMoves: [],
    isOver: false,
    linearShapes: [],
    threatHistory: [],
  } as GameState;
  for (let r = 0; r < boardSize; r++) {
    game.board.push({});
  }
  return game;
}

export function copyGame(game: GameState): GameState {
  return {
    board: game.board.map((row) => Object.assign({}, row)),
    currentPlayer: game.currentPlayer,
    captures: { ...game.captures },
    nMoves: game.nMoves,
    prevMoves: JSON.parse(JSON.stringify(game.prevMoves)),
    isOver: game.isOver,
    linearShapes: JSON.parse(JSON.stringify(game.linearShapes)),
    threatHistory: game.threatHistory.slice(),
  };
}

export function gameToString(game: GameState) {
  return (
    game.board.length +
    "~" +
    game.prevMoves.map((m) => m.addedGems[0].join(".")).join("|")
  );
}
export function loadFromString(s: string) {
  const [size, moveString] = s.split("~");
  const moves = moveString
    .split("|")
    .map((m) => m.split(".").map((x) => Number(x)));
  const game = createNewGame(Number(size));
  for (const [r, c] of moves) {
    makeMove(game, r, c);
  }
  return game;
}

export function toStandardCoords(r: number, c: number, boardSize: number) {
  // convert to coords used by Pente.org, useful when reading the website
  const letterCoords = "ABCDEFGHJKLMNOPQRST"; // omit I for clarity I suppose
  return [letterCoords[c] || "_", boardSize - r];
}

export function makeMove(game: GameState, r: number, c: number) {
  if (r < 0 || r >= game.board.length || c < 0 || c >= game.board.length)
    return;
  // can't go in a place with a piece
  if (game.board[r][c] !== undefined) return;
  // enforce first move in the center
  const center = Math.floor(game.board.length / 2);
  if (game.nMoves === 0 && (r !== center || c !== center)) return;
  // enforce first player's second move not inside box - actually don't do this b/c the old database didn't follow this rule, so this prevented recreating games for creating the feature CSV
  // if (isRestricted(game, r, c)) return

  const shapeUpdate: LinearShapeUpdate = { added: [], removed: [] }; // easier to reference as a separate variable from prevMove
  const moveInfo: MoveInfo = {
    addedGems: [],
    removedGems: [],
    linearShapeUpdate: shapeUpdate,
  };

  // place gemstone onto board
  game.board[r][c] = game.currentPlayer;
  moveInfo.addedGems.push([r, c]);

  // check for capture of opponent pair(s)
  // iterate over directions
  for (let dx of [-1, 0, 1]) {
    for (let dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      // out of bounds check
      if (c + 3 * dx < 0 || c + 3 * dx >= game.board.length) continue;
      if (r + 3 * dy < 0 || r + 3 * dy >= game.board.length) continue;

      if (
        game.board[r + dy][c + dx] !== undefined &&
        game.board[r + dy][c + dx] !== game.currentPlayer &&
        game.board[r + dy][c + dx] === game.board[r + 2 * dy][c + 2 * dx] &&
        game.board[r + 3 * dy][c + 3 * dx] === game.currentPlayer
      ) {
        delete game.board[r + dy][c + dx];
        delete game.board[r + 2 * dy][c + 2 * dx];
        moveInfo.removedGems.push([r + dy, c + dx], [r + 2 * dy, c + 2 * dx]);
        game.captures[game.currentPlayer]++;
      }
    }
  }
  // update linear shapes for all the locations we messed with
  moveInfo.addedGems.concat(moveInfo.removedGems).forEach(([r, c]) => {
    updateLinearShapes(game, r, c, shapeUpdate);
  });

  // console.log("added", shapeUpdate.added.map(s => s.hash))
  // console.log("removed", shapeUpdate.removed.map(s => s.hash))
  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // update threat history
  const addedThreats = shapeUpdate.added.filter(
    (s) =>
      ["open-tria", "stretch-tria"].includes(s.type) ||
      s.type.includes("pente-threat")
  );
  game.threatHistory.push(addedThreats.length);

  // check for game over
  if (
    game.captures[0] >= 5 ||
    game.captures[1] >= 5 ||
    game.linearShapes.some((shape) => shape.type === "pente")
  ) {
    game.isOver = true;
  }

  // update variables
  game.prevMoves.push(moveInfo);
  game.currentPlayer = Number(!game.currentPlayer) as 0 | 1;
  game.nMoves++;
}

export function undoMove(game: GameState) {
  const prevMove = game.prevMoves.pop();
  if (!prevMove) return;

  const prevPlayer = Number(!game.currentPlayer) as 0 | 1; // useful to just compute once

  // remove added gems
  prevMove.addedGems.forEach(([r, c]) => {
    delete game.board[r][c];
  });
  // undo captures
  game.captures[prevPlayer] -= prevMove.removedGems.length / 2;
  prevMove.removedGems.forEach(([r, c]) => {
    game.board[r][c] = game.currentPlayer; // current player is whose gems were just captured
  });

  // remove added linear shapes
  const addedHashes = prevMove.linearShapeUpdate.added.map(
    (shape) => shape.hash
  );
  game.linearShapes = game.linearShapes.filter(
    (shape) => !addedHashes.includes(shape.hash)
  );
  // add removed linear shapes
  prevMove.linearShapeUpdate.removed.forEach((shape) =>
    game.linearShapes.push(shape)
  );

  // console.log(game.linearShapes.map(s => s.hash).join("\n"))

  // update other variables
  game.threatHistory.pop();
  game.currentPlayer = prevPlayer;
  game.nMoves -= 1;
  game.isOver = false;
}

export const linearShapeDef = {
  // shapes are defined from the perspective of me as player 1 and opponent as player 0
  // shapes should be defined so that they are "owned" by player 1, intuitively
  // they will be automatically flipped by the code, so don't have to include both forwards/backwards versions of asymmetrical patterns
  // note: if one of these is contained in another, both will be found
  pente: "11111",
  "open-tessera": "_1111_",
  "pente-threat-4": "1111_",
  "pente-threat-31": "111_1",
  "pente-threat-22": "11_11",
  "open-tria": "_111_",
  "stretch-tria": "_11_1_",
  "extendable-tria": "111__",
  "extendable-stretch-tria-1": "1_11_",
  "extendable-stretch-tria-2": "11_1_",
  "open-pair": "_11_",
  "capture-threat": "100_",
  "stretch-two": "_1_1_",
  "double-stretch-two": "_1__1_",
  "three-gap": "1___1",
  "pente-potential-1": "1_1_1",
  "pente-potential-2": "1__11",
  // "three": "111" // used for nonlinear shape detection
  // "blocked-pente-4": "11110",  // these don't help with evaluation when adding to the model, but perhaps are useful for detecting keystone threats?
  // "blocked-pente-31": "11101",
  // "blocked-pente-22": "11011"
};

// expand shape definition to include flips and both players, and store as a map for easy lookup
// key is a string matching the pattern, e.g. 011_ for a capture threat
export const linearShapes = new Map();
let maxLinearShapeLength = 0;

for (const [type, pattern] of Object.entries(linearShapeDef)) {
  // add forward and backwards patterns
  linearShapes.set(pattern, { type: type, owner: 1, length: pattern.length });
  linearShapes.set(pattern.split("").reverse().join(""), {
    type: type,
    owner: 1,
    length: pattern.length,
  });
  // do it for the other player
  const patternSwitchPlayers = pattern
    .replace(/1/g, "x")
    .replace(/0/g, "1")
    .replace(/x/g, "0");
  linearShapes.set(patternSwitchPlayers, {
    type: type,
    owner: 0,
    length: pattern.length,
  });
  linearShapes.set(patternSwitchPlayers.split("").reverse().join(""), {
    type: type,
    owner: 0,
    length: pattern.length,
  });
  // update max length
  maxLinearShapeLength = Math.max(pattern.length, maxLinearShapeLength);
}

export const nonlinearShapeTypes = ["X", "big-L", "small-L"];

// map to memoize linear shape pattern matches
export const patternMatchMap = new Map();

function getPatternMatches(str: string) {
  const existingAnswer = patternMatchMap.get(str);
  if (existingAnswer) return existingAnswer;

  const matches = [];
  for (const pattern of linearShapes.keys()) {
    for (let start = 0; start <= str.length - pattern.length; start++) {
      let matchHere = true;
      for (let i = 0; i < pattern.length; i++) {
        if (str[start + i] !== pattern[i]) {
          matchHere = false;
          break;
        }
      }
      if (matchHere) {
        matches.push({ index: start, pattern: pattern });
      }
    }
  }
  patternMatchMap.set(str, matches);
  return matches;
}

export function updateLinearShapes(
  game: GameState,
  r0: number,
  c0: number,
  update: LinearShapeUpdate = { added: [], removed: [] }
) {
  // Given a game state, update the game state's list of linear shapes.
  // Will only take into account shapes that include the r0,c0 location.
  // This takes advantage of the fact that a move can only create/affect
  // shapes containing its location, or locations of captured stones.
  // Also, update the shape update object passed in with the shapes that were added and removed.

  (() => {
    // remove any shapes that are no longer there
    game.linearShapes = game.linearShapes.filter((shape) => {
      const dy = shape.dy;
      const dx = shape.dx;

      // if no overlap with the changed location, couldn't possibly be gone now
      // checking this for horizontal and vertical shapes is really cheap so do it
      // not worth it for diagonal shapes
      if (dy === 0 && r0 !== shape.begin[0]) return true;
      if (dx === 0 && c0 !== shape.begin[1]) return true;

      for (
        let i = 0, r = shape.begin[0], c = shape.begin[1];
        i < shape.length;
        i++, r += dy, c += dx
      ) {
        const s =
          game.board[r][c] === undefined ? "_" : game.board[r][c].toString();
        if (s !== shape.pattern.charAt(i)) {
          update.removed.push(shape);
          return false;
        }
      }
      return true;
    });
  })();

  (() => {
    // add new shapes

    // find the center character outside the loop, so only have to do it once
    const value0 = game.board[r0][c0];
    const s0 = value0 === undefined ? "_" : value0.toString();

    // iterate over each of four directions - row, col, (\) diagonal, (/) diagonal
    for (const [dy, dx] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 1],
    ]) {
      // construct string to search for patterns in
      let s = s0;
      // prepend to s and find rInit and cInit, treating rInit and cInit as indices
      let rInit = r0 - dy;
      let cInit = c0 - dx;
      (() => {
        for (
          let i = 1;
          i < maxLinearShapeLength;
          i++, rInit -= dy, cInit -= dx
        ) {
          if (
            rInit < 0 ||
            cInit < 0 ||
            rInit >= game.board.length ||
            cInit >= game.board.length
          ) {
            break;
          }
          const value = game.board[rInit][cInit];
          s = (value === undefined ? "_" : value) + s;
        }
        // in both the case where we went off the edge of the board, and the case where the loop exited naturally,
        // rInit and cInit will be currently one spot further than they should be, so rewind them
        rInit += dy;
        cInit += dx;

        // append to s
        for (
          let i = 1, r = r0 + dy, c = c0 + dx;
          i < maxLinearShapeLength;
          i++, r += dy, c += dx
        ) {
          if (
            r < 0 ||
            c < 0 ||
            r >= game.board.length ||
            c >= game.board.length
          ) {
            break;
          }
          const value = game.board[r][c];
          s += value === undefined ? "_" : value;
        }
      })();

      // search for each pattern
      const matches = getPatternMatches(s);
      if (!matches) continue;

      (() => {
        for (const match of matches) {
          const pattern: string = match.pattern;
          const patternInfo = linearShapes.get(pattern);
          const begin = [rInit + dy * match.index, cInit + dx * match.index];
          let hash: string;
          (() => {
            hash = `${patternInfo.type},${patternInfo.owner},${begin[0]},${begin[1]},${dy},${dx}`;
          })();
          const shape: LinearShape = {
            type: patternInfo.type,
            pattern: pattern,
            owner: patternInfo.owner,
            begin: begin,
            dy: dy,
            dx: dx,
            length: patternInfo.length,
            hash: hash,
          };
          if (!game.linearShapes.some((s) => s.hash === shape.hash)) {
            game.linearShapes.push(shape);
            update.added.push(shape);
          }
        }
      })();
    }
  })();
}
