export class Game {
  public board: i32[][] = []  // value is 0 or 1, or -1 if empty
  public currentPlayer: i32 = 0  // 0 or 1
  public captures: i32[] = [0, 0]  // key is player, value is n captures
  public nMoves: i32 = 0
  public prevMoves: MoveInfo[] = []
  public isOver: boolean = false
  public linearShapes: LinearShape[] = []
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
// this is intended to be readonly b/c there's no reason to change it, and because there might be multiple references to the same LinearShape object
// (e.g. transposition table, re-using game state object when searching) - want to avoid accidental bugs from mutation
export class LinearShape {
  type: string = ""
  pattern: string = ""
  owner: i32 = 0  // 0 or 1, player that "owns" this shape intuitively
  begin: i32[] = []
  end: i32[] = []
  length: i32 = 0
  hash: string = ""  // uniquely identifies this shape, defined by: [type, owner, begin, end].join()
}
// having a separate function instead of a constructor so that we can send objects outside of web assembly instead of just a number reference
export function createLinearShape(type: string, pattern: string, owner: i32, begin: i32[], end: i32[]): LinearShape {
  const shape = new LinearShape()
  shape.type = type
  shape.pattern = pattern
  shape.owner = owner
  shape.begin = begin
  shape.end = end
  shape.length = pattern.length
  shape.hash = [type, owner.toString(), begin.join(), end.join()].join()
  return shape
}

export interface SearchResult {
  eval: i32
  evalFlag: EvalFlag
  bestVariation: i32[][]
}
export type EvalFlag = "exact" | "upper-bound" | "lower-bound"