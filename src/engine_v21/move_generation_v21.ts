import { gameStrings } from "@/gameStrings";
import {
  type GameState,
  type SearchResult,
  type LinearShape,
  createNewGame,
  makeMove,
} from "./model_v21";
import { type TTEntry } from "./ttable_v21";
import {
  emptySpotsInShape,
  getKeystoneCaptureThreats,
  getMovesBlockingThreat,
} from "./shape_utilities_v21";

// store which shapes should be looked at first, to use when ordering moves, earlier is more important
const shapePriorityDef = [
  // pente threats are the most urgent
  "my-pente-threat-4",
  "my-pente-threat-31",
  "my-pente-threat-22",
  "opponent-pente-threat-4",
  "opponent-pente-threat-31",
  "opponent-pente-threat-22",
  // stuff that can create an open tessera (double pente threat)
  "my-stretch-tria", // stretch tria first b/c has a vulnerable pair
  "my-open-tria",
  // stuff that can create a pente threat is forcing (important for me, not so important to block opponent from doing this)
  "my-keystone-capture-threat", // best because also captures a pair - NOTE: not an official shape type, handled specially
  "my-extendable-stretch-tria-2", // contains vulnerable pair
  "my-pente-potential-2", // contains vulnerable pair
  "my-extendable-stretch-tria-1",
  "my-pente-potential-1",
  "my-extendable-tria",
  // after moves that threaten pente, deal with opponent tessera threats
  "opponent-stretch-tria",
  "opponent-open-tria",
  // keystone captures can be bad threats, and usually not that many so it's better to examine them before looking at our many stretch twos etc.
  "opponent-keystone-capture-threat", // NOTE: not an official shape type, handled specially
  // favor things that can create a tria
  "my-open-pair",
  "my-stretch-two",
  "my-double-stretch-two",
  // captures can sometimes be forcing
  "my-capture-threat",
  // block opponent non-forcing shapes
  "opponent-capture-threat",
  "opponent-open-pair",
  "opponent-stretch-two",
  "opponent-double-stretch-two",
  "opponent-extendable-stretch-tria-2", // contains vulnerable pair
  "opponent-pente-potential-2", // contains vulnerable pair
  "opponent-extendable-stretch-tria-1",
  "opponent-pente-potential-1",
  "opponent-extendable-tria",
  // favor keeping gems in line with each other
  "my-three-gap",
  "opponent-three-gap",
];

// if shape isn't owned by me or is in this below list, is considered non-forcing
const nonForcingShapes = ["stretch-two", "open-pair", "three-gap", "three"];

// convert to an object instead of an array for faster lookup
const shapePriority: Record<string, number> = Object.fromEntries(
  shapePriorityDef.map((name, idx) => [name, idx])
);

// function to prevent the first player from placing their second piece within the center box
export function isRestricted(game: GameState, r: number, c: number) {
  // only relevant on the 3rd move of the game
  if (game.nMoves !== 2) return false;
  const center = Math.floor(game.board.length / 2);
  if (Math.abs(r - center) < 3 && Math.abs(c - center) < 3) return true;
  return false;
}

export function* makeOrderedMoveIterator(
  game: GameState,
  ply: number, // only used if have killer moves
  principalVariationMove: number[] | undefined = undefined,
  tableEntry: TTEntry | undefined = undefined,
  killerMoves: number[][][] = [],
  prevDepthResults: SearchResult[] = []
) {
  // because good moves often cause a cutoff, don't generate more less-good moves unless needed
  // so, this function returns an iterator that only generates moves as needed (using generator syntax for readability)

  if (game.isOver) return;

  // setup
  const moveHashes = new Set(); // remember moves we've returned already, so we don't repeat - values are just "r,c"
  const symmetries = game.nMoves <= 5 ? detectSymmetry(game) : [];
  const center = Math.floor(game.board.length / 2);

  const isValidNewMove = function (move: number[]) {
    if (isRestricted(game, move[0], move[1])) return false;
    if (moveHashes.has(move.toString())) return false;
    if (
      move[0] < 0 ||
      move[0] >= game.board.length ||
      move[1] < 0 ||
      move[1] >= game.board.length
    )
      return false;
    return game.board[move[0]][move[1]] === undefined;
  };

  const registerMove = function (m: number[]) {
    moveHashes.add(m.toString());
    // mark any symmetric moves so they don't get tried
    for (const sym of symmetries) {
      const duplicate = applySymmetry(m[0], m[1], sym, center);
      moveHashes.add(duplicate.toString());
    }
  };

  // first move must be in center
  if (game.nMoves === 0) {
    // check if valid, because it might be excluded if we are on the second variation
    // in which case we wouldn't return any other moves, because this is the only possible move
    if (isValidNewMove([center, center])) {
      yield [center, center];
    }
    return;
  }
  // second move should be one of the only moves that Pente forums think are tenable
  // https://pente.org/gameServer/forums/thread.jspa?forumID=27&threadID=2925&messageID=8961#8961
  if (game.nMoves === 1) {
    for (const m of [
      [9, 10],
      [9, 11],
      [10, 10],
      [10, 11],
      [10, 12],
      [10, 13],
      [11, 12],
      [11, 13],
      [12, 13],
    ]) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    if (moveHashes.size !== 0) return;
  }
  // third move should be orthogonal to center, two spaces away, no matter what the second player did
  // pretty good consensus here: https://pente.org/gameServer/forums/thread.jspa?forumID=27&threadID=4043&start=0&tstart=125#15843
  if (game.nMoves === 2) {
    for (const m of [
      [6, 9],
      [9, 6],
      [9, 12],
      [12, 9],
    ]) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    if (moveHashes.size !== 0 && (ply === 1 || ply === 3)) return; // ply check: limit it to this if we are making the move
  }

  // first priority is principal variation move
  if (principalVariationMove !== undefined) {
    if (isValidNewMove(principalVariationMove)) {
      yield principalVariationMove;
      registerMove(principalVariationMove);
    }
  }

  // for other moves, use order from prevDepthResults - this will contain all remaining moves,
  // ranked by how good they were in the previous iteration of iterative deepening
  if (prevDepthResults.length > 0) {
    for (const result of prevDepthResults) {
      const m = result.bestVariation[0];
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    return;
  }
  // if we don't have such a nice list, use heuristics

  // second priority is transposition table entry (aka hash move)
  if (tableEntry !== undefined) {
    const goodMove = tableEntry.result.bestVariation[0];
    if (goodMove !== undefined) {
      if (isValidNewMove(goodMove)) {
        yield goodMove;
        registerMove(goodMove);
      }
    }
  }
  // third priority are killer moves
  if (killerMoves[ply]) {
    for (const m of killerMoves[ply]) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
  }

  // calculate if threatening things exist
  const myPenteThreat = game.linearShapes.find(
    (shape) =>
      shape.owner === game.currentPlayer && shape.type.includes("pente-threat")
  );
  const captureThreats = game.linearShapes.filter(
    (shape) => shape.type === "capture-threat"
  );
  // find instances of capture threats, useful so don't have to search twice later
  const myCaptureThreat = captureThreats.find(
    (threat) => threat.owner === game.currentPlayer
  );
  const opponentCaptureThreat = captureThreats.find(
    (threat) => threat.owner !== game.currentPlayer
  );

  // if I have a pente threat, the only relevant move is winning
  if (myPenteThreat) {
    for (const m of emptySpotsInShape(myPenteThreat)) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    return;
  }
  // else if I have 4 captures and a capture threat, only relevant move is winning
  if (game.captures[game.currentPlayer] === 4 && myCaptureThreat) {
    for (const m of emptySpotsInShape(myCaptureThreat)) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    return;
  }
  // else if opponent has 4 captures and a capture threat, only relevant moves are blocking it
  if (
    game.captures[Number(!game.currentPlayer) as 0 | 1] === 4 &&
    opponentCaptureThreat
  ) {
    for (const m of getMovesBlockingThreat(game, opponentCaptureThreat)) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
    return;
  }
  // else if there are opponent pente threats, the only relevant moves are blocking them
  const opponentPenteThreats = game.linearShapes.filter(
    (shape) =>
      shape.owner !== game.currentPlayer && shape.type.includes("pente-threat")
  );
  if (opponentPenteThreats.length > 0) {
    for (const threat of opponentPenteThreats) {
      for (const m of getMovesBlockingThreat(game, threat)) {
        if (isValidNewMove(m)) {
          yield m;
          registerMove(m);
        }
      }
    }
    return;
  }

  // if move is part of an existing shape, it is probably interesting
  // also, if it is part of a forcing shape it is probably more interesting, so visit those first
  // sort linear shapes first and then iterate over spots - it's okay that this is sorting in place, helps to keep the game object ordered (and might help speed up further sorts)
  // we will need to know if capture threats are keystone capture threats
  const keystoneCaptureThreatHashes = new Set(
    getKeystoneCaptureThreats(game).map((s) => s.hash)
  );
  // map shape hash to its priority (speeds up sorting to only do this once)
  const priorityMap = new Map<string, number>();
  game.linearShapes.forEach((shape) => {
    let shapeType = shape.type;
    if (keystoneCaptureThreatHashes.has(shape.hash)) {
      shapeType = "keystone-capture-threat";
    }
    const shapeKey =
      (shape.owner === game.currentPlayer ? "my-" : "opponent-") + shapeType;
    const priority = shapePriority[shapeKey] || Infinity; // infinity is worst priority
    priorityMap.set(shape.hash, priority);
  });
  game.linearShapes.sort((a, b) => {
    const aPriority = priorityMap.get(a.hash) || Infinity; // did OR Infinity to make typescript happy, all shapes should be in the map
    const bPriority = priorityMap.get(b.hash) || Infinity;
    return aPriority - bPriority;
  });
  // however, we need another reference to the sorted version (probably?), because linear shapes get added and removed from the game as we traverse the search tree, so the sorting gets messed up
  let sortedShapes = game.linearShapes.slice();

  // find moves in shapes
  for (const shape of sortedShapes) {
    // for my double stretch twos only suggest the moves that make a stretch tria, the other two aren't that good
    // for opponent ones though all spots are reasonable blocking locations
    let excludeIndices: number[] = [];
    if (
      shape.type === "double-stretch-two" &&
      shape.owner === game.currentPlayer
    ) {
      excludeIndices = [0, 5];
    }

    for (const m of emptySpotsInShape(shape, excludeIndices)) {
      if (isValidNewMove(m)) {
        yield m;
        registerMove(m);
      }
    }
  }

  // find gems to generate moves near them
  const gemLocations = {
    me: [] as number[][],
    opponent: [] as number[][],
  };
  for (let r = 0; r < game.board.length; r++) {
    for (const c in game.board[r]) {
      // gems are present at columsn corresponding to the keys in the row object
      if (game.board[r][c] === game.currentPlayer) {
        gemLocations["me"].push([r, Number(c)]);
      } else {
        gemLocations["opponent"].push([r, Number(c)]);
      }
    }
  }
  // sort gems - closer to center are probably more important
  const distanceCompare = (a: number[], b: number[]) => {
    const aDist = Math.hypot(a[0] - center, a[1] - center);
    const bDist = Math.hypot(b[0] - center, b[1] - center);
    return aDist - bDist;
  };
  gemLocations["me"].sort(distanceCompare);
  gemLocations["opponent"].sort(distanceCompare);

  // // suggest spots that make stretch twos, because those are part of many momentum shapes in the opening
  // // function below checks if the stretch two would be blocked, to avoid suggesting that
  // const otherPlayer = Number(!game.currentPlayer)
  // const stretchTwoBlocked = (gem: number[], dy: number, dx: number) => {  // dy and dx should be -1,0, or 1
  //   for (const i of [-1, 1, 3]) {
  //     if (game.board[gem[0] + i * dy] && game.board[gem[0] + i * dy][gem[1] + i * dx] === otherPlayer) return true
  //   }
  //   return false
  // }
  // // prioritize orthogonal stretch twos because I think those are stronger
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
  //     const move = [gem[0] + 2 * dy, gem[1] + 2 * dx]
  //     if (stretchTwoBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }
  // // diagonal stretch twos
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
  //     const move = [gem[0] + 2 * dy, gem[1] + 2 * dx]
  //     if (stretchTwoBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }
  // // suggest spots with the potential to make open pairs (tria potential)
  // // as with stretch twos, if the open pair would be blocked, put it into a list for later
  // const openPairBlocked = (gem: number[], dy: number, dx: number) => { // dy and dx should be -1,0, or 1
  //   for (const i of [-1, 2]) {
  //     if (game.board[gem[0] + i * dy] && game.board[gem[0] + i * dy][gem[1] + i * dx] === otherPlayer) return true
  //   }
  //   return false
  // }
  // // prioritize orthogonal open pairs because I think those are stronger
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
  //     const move = [gem[0] + dy, gem[1] + dx]
  //     if (openPairBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }
  // // diagonal open pairs
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
  //     const move = [gem[0] + dy, gem[1] + dx]
  //     if (openPairBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }
  // // suggest spots with the potential to make double stretch twos (stretch tria potential)
  // // do these after open pairs because evaluation data fitting suggests they matter less
  // const doubleStretchTwoBlocked = (gem: number[], dy: number, dx: number) => { // dy and dx should be -1,0, or 1
  //   for (const i of [-1, 1, 2, 4]) {
  //     if (game.board[gem[0] + i * dy] && game.board[gem[0] + i * dy][gem[1] + i * dx] === otherPlayer) return true
  //   }
  //   return false
  // }
  // // prioritize orthogonal because I think those are stronger
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
  //     const move = [gem[0] + 3 * dy, gem[1] + 3 * dx]
  //     if (doubleStretchTwoBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }
  // // diagonal
  // for (const gem of gemLocations["me"]) {
  //   for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
  //     const move = [gem[0] + 3 * dy, gem[1] + 3 * dx]
  //     if (doubleStretchTwoBlocked(gem, dy, dx)) continue
  //     if (isValidNewMove(move)) {
  //       yield move
  //       registerMove(move)
  //     }
  //   }
  // }

  // return all other spots near gems, looking at spots near gems first
  const dists = game.nMoves < 4 ? [0, -1, 1, -2, 2, -3, 3] : [0, -1, 1, -2, 2];
  for (const dy of dists) {
    for (const dx of dists) {
      // do near my gems first
      for (const gem of gemLocations["me"].concat(gemLocations["opponent"])) {
        if (dy === 0 && dx === 0) continue;
        const m = [gem[0] + dy, gem[1] + dx];
        if (isValidNewMove(m)) {
          yield m;
          registerMove(m);
        }
      }
    }
  }
}

export function createOpeningBook() {
  const book = new Map<string, number[]>(); // game string: [num player 0 wins, num player 1 wins]
  for (const s of gameStrings) {
    const [size, moveString] = s.split("~");
    const moves = moveString
      .split("|")
      .map((m) => m.split(".").map((x) => Number(x)));
    const game = createNewGame(Number(size));
    for (const m of moves) {
      makeMove(game, m[0], m[1]);
    }
    const winner = Number(!game.currentPlayer); // the previous player just won
    // go through first couple of positions and record who won
    const split = s.split("|");
    let openingString = split[0];
    for (let i = 1; i < split.length; i++) {
      const counts = book.get(openingString) || [0, 0];
      counts[winner]++;
      book.set(openingString, counts);
      openingString += "|" + split[i];
    }
  }
  // filter out openings that are really just one game
  const minGames = 5;
  for (const k of book.keys()) {
    const counts = book.get(k);
    if (counts && counts[0] + counts[1] < minGames) {
      book.delete(k);
    }
  }

  const entries = Array.from(book.entries());
  const prettyJSON =
    "[\n" + entries.map((x) => JSON.stringify(x)).join(",\n") + "\n]";
  console.log(prettyJSON);
}

interface Symmetry {
  rotateClockwise: boolean;
  flipHoriz: boolean;
  flipVert: boolean;
} // where rotating is done before flipping

export function applySymmetry(
  r: number,
  c: number,
  sym: Symmetry,
  center: number
) {
  // convert to center-relative coords
  r -= center;
  c -= center;
  // rotate
  if (sym.rotateClockwise) {
    [r, c] = [c, -r];
  }
  // flip
  if (sym.flipHoriz) {
    c = -c;
  }
  if (sym.flipVert) {
    r = -r;
  }
  // convert back to absolute coords
  r += center;
  c += center;
  return [r, c];
}

export function detectSymmetry(game: GameState): Symmetry[] {
  // finds the symmetries in a position
  const symmetries = [];
  const center = Math.floor(game.board.length / 2);
  // iterate through possible symmetries
  for (const rotate of [false, true]) {
    for (const flipHoriz of [false, true]) {
      symmetryLoop: for (const flipVert of [false, true]) {
        if (!rotate && !flipHoriz && !flipVert) continue; // this would be doing nothing

        const sym: Symmetry = {
          rotateClockwise: rotate,
          flipHoriz: flipHoriz,
          flipVert: flipVert,
        };

        // iterate through stones on board
        for (let r = 0; r < game.board.length; r++) {
          for (const c in game.board[r]) {
            const applied = applySymmetry(r, Number(c), sym, center);
            // check for symmetry failure
            if (game.board[applied[0]][applied[1]] !== game.board[r][c])
              break symmetryLoop;
          }
        }
        symmetries.push(sym);
      }
    }
  }
  return symmetries;
}
