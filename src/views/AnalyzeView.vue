<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

// import { createNewGame, makeMove, undoMove } from '@/engine_v6/model_v6';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v6/engine_v6';

// import { createNewGame, makeMove, undoMove } from '@/engine_v7/model_v7';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v7/engine_v7';

// import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v8/model_v8';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v8/engine_v8';

// import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v9/model_v9';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v9/engine_v9';

// import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v10/model_v10';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator, getNonQuietMoves } from '@/engine_v10/engine_v10';

import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v11/model_v11';
import { findBestMove, evaluatePosition, makeOrderedMoveIterator, getNonQuietMoves } from '@/engine_v11/engine_v11';


const game = ref(createNewGame(19))

game.value = JSON.parse(`{"board":[{},{},{},{},{},{},{},{},{"7":0},{"8":1,"9":0},{"7":0,"8":1,"9":1},{"7":0,"9":0,"10":1},{"11":0},{"12":1},{},{},{},{},{}],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":11,"prevMoves":[{"addedGems":[[9,9]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[9,8]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[11,9]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[8,9],"end":[12,9],"length":5,"hash":"stretch-two,0,8,9,12,9"}],"removed":[]}},{"addedGems":[[10,9]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[8,9],"end":[12,9],"length":5,"hash":"stretch-two,0,8,9,12,9"}]}},{"addedGems":[[8,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[8,7],"end":[11,10],"length":4,"hash":"capture-threat,0,8,7,11,10"}],"removed":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}]}},{"addedGems":[[11,10]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"extendable-tria","pattern":"0111__","owner":1,"begin":[8,7],"end":[13,12],"length":6,"hash":"extendable-tria,1,8,7,13,12"}],"removed":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[8,7],"end":[11,10],"length":4,"hash":"capture-threat,0,8,7,11,10"}]}},{"addedGems":[[11,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[12,6],"end":[8,10],"length":5,"hash":"stretch-two,0,12,6,8,10"}],"removed":[]}},{"addedGems":[[13,12]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"pente-threat-31","pattern":"111_1","owner":1,"begin":[9,8],"end":[13,12],"length":5,"hash":"pente-threat-31,1,9,8,13,12"}],"removed":[{"type":"extendable-tria","pattern":"0111__","owner":1,"begin":[8,7],"end":[13,12],"length":6,"hash":"extendable-tria,1,8,7,13,12"}]}},{"addedGems":[[12,11]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[{"type":"pente-threat-31","pattern":"111_1","owner":1,"begin":[9,8],"end":[13,12],"length":5,"hash":"pente-threat-31,1,9,8,13,12"}]}},{"addedGems":[[10,8]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[10,7],"end":[10,10],"length":4,"hash":"open-pair,1,10,7,10,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,8],"end":[11,8],"length":4,"hash":"open-pair,1,8,8,11,8"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[12,6],"end":[8,10],"length":5,"hash":"stretch-two,0,12,6,8,10"}]}},{"addedGems":[[10,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[10,7],"end":[10,10],"length":4,"hash":"capture-threat,0,10,7,10,10"},{"type":"stretch-tria","pattern":"_0_00_","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"stretch-tria,0,7,7,12,7"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[9,7],"end":[12,7],"length":4,"hash":"open-pair,0,9,7,12,7"}],"removed":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[10,7],"end":[10,10],"length":4,"hash":"open-pair,1,10,7,10,10"}]}}],"isOver":false,"linearShapes":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[10,7],"end":[10,10],"length":4,"hash":"capture-threat,0,10,7,10,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,8],"end":[11,8],"length":4,"hash":"open-pair,1,8,8,11,8"},{"type":"stretch-tria","pattern":"_0_00_","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"stretch-tria,0,7,7,12,7"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[9,7],"end":[12,7],"length":4,"hash":"open-pair,0,9,7,12,7"}]}`)

// game.value = JSON.parse(`{"board":[{},{},{},{},{},{},{},{"7":1},{"7":0},{"7":0,"8":1,"9":0},{"7":0,"8":1,"9":1},{"7":0,"9":0,"10":1},{"7":1,"11":0},{"12":1},{},{},{},{},{}],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":14,"prevMoves":[{"addedGems":[[9,9]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[9,8]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[11,9]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[8,9],"end":[12,9],"length":5,"hash":"stretch-two,0,8,9,12,9"}],"removed":[]}},{"addedGems":[[10,9]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[8,9],"end":[12,9],"length":5,"hash":"stretch-two,0,8,9,12,9"}]}},{"addedGems":[[8,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[8,7],"end":[11,10],"length":4,"hash":"capture-threat,0,8,7,11,10"}],"removed":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}]}},{"addedGems":[[11,10]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"extendable-tria","pattern":"0111__","owner":1,"begin":[8,7],"end":[13,12],"length":6,"hash":"extendable-tria,1,8,7,13,12"}],"removed":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[8,7],"end":[11,10],"length":4,"hash":"capture-threat,0,8,7,11,10"}]}},{"addedGems":[[11,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[12,6],"end":[8,10],"length":5,"hash":"stretch-two,0,12,6,8,10"}],"removed":[]}},{"addedGems":[[13,12]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"pente-threat-31","pattern":"111_1","owner":1,"begin":[9,8],"end":[13,12],"length":5,"hash":"pente-threat-31,1,9,8,13,12"}],"removed":[{"type":"extendable-tria","pattern":"0111__","owner":1,"begin":[8,7],"end":[13,12],"length":6,"hash":"extendable-tria,1,8,7,13,12"}]}},{"addedGems":[[12,11]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[{"type":"pente-threat-31","pattern":"111_1","owner":1,"begin":[9,8],"end":[13,12],"length":5,"hash":"pente-threat-31,1,9,8,13,12"}]}},{"addedGems":[[10,8]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[10,7],"end":[10,10],"length":4,"hash":"open-pair,1,10,7,10,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,8],"end":[11,8],"length":4,"hash":"open-pair,1,8,8,11,8"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[12,6],"end":[8,10],"length":5,"hash":"stretch-two,0,12,6,8,10"}]}},{"addedGems":[[10,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[10,7],"end":[10,10],"length":4,"hash":"capture-threat,0,10,7,10,10"},{"type":"stretch-tria","pattern":"_0_00_","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"stretch-tria,0,7,7,12,7"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[9,7],"end":[12,7],"length":4,"hash":"open-pair,0,9,7,12,7"}],"removed":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[10,7],"end":[10,10],"length":4,"hash":"open-pair,1,10,7,10,10"}]}},{"addedGems":[[12,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"extendable-stretch-tria-threatened","pattern":"_0_001","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"extendable-stretch-tria-threatened,0,7,7,12,7"},{"type":"capture-threat","pattern":"_001","owner":1,"begin":[9,7],"end":[12,7],"length":4,"hash":"capture-threat,1,9,7,12,7"},{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[13,6],"end":[9,10],"length":5,"hash":"stretch-two,1,13,6,9,10"}],"removed":[{"type":"stretch-tria","pattern":"_0_00_","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"stretch-tria,0,7,7,12,7"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[9,7],"end":[12,7],"length":4,"hash":"open-pair,0,9,7,12,7"}]}},{"addedGems":[[9,7]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"pente-threat-4","pattern":"_0000","owner":0,"begin":[7,7],"end":[11,7],"length":5,"hash":"pente-threat-4,0,7,7,11,7"}],"removed":[{"type":"extendable-stretch-tria-threatened","pattern":"_0_001","owner":0,"begin":[7,7],"end":[12,7],"length":6,"hash":"extendable-stretch-tria-threatened,0,7,7,12,7"},{"type":"capture-threat","pattern":"_001","owner":1,"begin":[9,7],"end":[12,7],"length":4,"hash":"capture-threat,1,9,7,12,7"}]}},{"addedGems":[[7,7]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[{"type":"pente-threat-4","pattern":"_0000","owner":0,"begin":[7,7],"end":[11,7],"length":5,"hash":"pente-threat-4,0,7,7,11,7"}]}}],"isOver":false,"linearShapes":[{"type":"capture-threat","pattern":"011_","owner":0,"begin":[10,7],"end":[10,10],"length":4,"hash":"capture-threat,0,10,7,10,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,8],"end":[11,8],"length":4,"hash":"open-pair,1,8,8,11,8"},{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[13,6],"end":[9,10],"length":5,"hash":"stretch-two,1,13,6,9,10"}]}`)


declare global {
  interface Console {
    profile: () => any
    profileEnd: () => any
  }
}
function profile(){
  console.profile()
  findBestMove(game.value)
  console.profileEnd()
}

function timeTest(){
  const start = performance.now()
  const query = "__11_1_00__"
  const big_re = /(?=(11111|00000|_1111_|_0000_|1111_|_1111|0000_|_0000|111_1|1_111|000_0|0_000|11_11|00_00|_111_|_000_|_11_1_|_1_11_|_00_0_|_0_00_|0111__|__1110|1000__|__0001|_11_|_00_|100_|_001|011_|_110|_1_1_|_0_0_))/g
  const all_re = [
   /11111/,/00000/,/_1111_/,/_0000_/,/1111_/,/_1111/,/0000_/,/_0000/,/111_1/,/1_111/,/000_0/,/0_000/,/11_11/,/00_00/,/_111_/,/_000_/,/_11_1_/,/_1_11_/,/_00_0_/,/_0_00_/,/0111__/,/__1110/,/1000__/,/__0001/,/_11_/,/_00_/,/100_/,/_001/,/011_/,/_110/,/_1_1_/,/_0_0_/ 
  ]
  for(let i=0; i<10000; i++){
    updateLinearShapes(game.value, 9, 9)
  }
  console.log(performance.now() - start + " ms")
}


function printMoves(){
  for(const move of makeOrderedMoveIterator(game.value, 1)){
    console.log(move)
  }
  console.log("")
}


</script>




<template>
  <div style="color: white;">Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
  <button @click="profile()">Profile</button><br>
  <button @click="console.log(JSON.stringify(getNonQuietMoves(game)))">Get QS Moves</button><br>
  <button @click="printMoves()">Generate Moves</button><br>
  <button @click="console.log(evaluatePosition(game))">Evaluate</button><br>
  <button @click="undoMove(game)">Undo Move</button><br>
  <button @click="console.log(game.linearShapes.map(shape => shape.hash).join('\n'))">Get Linear Shapes</button><br>
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="timeTest()">Time Test</button>

  <Board class="board" :game="game" show-coord-labels @make-move="(r, c) => makeMove(game, r, c)" />
</template>


<style scoped>

.board {
  position: absolute;
  inset: 0;
  margin: auto;
}
</style>