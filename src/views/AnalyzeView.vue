<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

// import { createNewGame, makeMove, undoMove } from '@/engine_v6/model_v6';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v6/engine_v6';

// import { createNewGame, makeMove, undoMove } from '@/engine_v7/model_v7';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v7/engine_v7';

// import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v8/model_v8';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v8/engine_v8';

import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v9/model_v9';
import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v9/engine_v9';


const game = ref(createNewGame(19))

game.value = JSON.parse(`{"board":[{},{},{},{},{},{},{},{"11":0},{"10":1},{"8":1,"9":0,"10":0,"11":0},{"9":1,"11":1},{},{},{},{},{},{},{},{}],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":8,"prevMoves":[{"addedGems":[[9,9]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[10,9]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[9,11]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[9,8],"end":[9,12],"length":5,"hash":"stretch-two,0,9,8,9,12"}],"removed":[]}},{"addedGems":[[8,10]],"removedGems":[],"linearShapeUpdate":{"added":[],"removed":[]}},{"addedGems":[[7,11]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[6,11],"end":[10,11],"length":5,"hash":"stretch-two,0,6,11,10,11"}],"removed":[]}},{"addedGems":[[10,11]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[6,11],"end":[10,11],"length":5,"hash":"stretch-two,0,6,11,10,11"}]}},{"addedGems":[[9,10]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-tria","pattern":"__000_","owner":0,"begin":[9,7],"end":[9,12],"length":6,"hash":"open-tria,0,9,7,9,12"},{"type":"open-tria","pattern":"_000__","owner":0,"begin":[9,8],"end":[9,13],"length":6,"hash":"open-tria,0,9,8,9,13"},{"type":"extendable-tria","pattern":"000__","owner":0,"begin":[9,9],"end":[9,13],"length":5,"hash":"extendable-tria,0,9,9,9,13"}],"removed":[{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[9,8],"end":[9,12],"length":5,"hash":"stretch-two,0,9,8,9,12"}]}},{"addedGems":[[9,8]],"removedGems":[],"linearShapeUpdate":{"added":[{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}],"removed":[{"type":"open-tria","pattern":"__000_","owner":0,"begin":[9,7],"end":[9,12],"length":6,"hash":"open-tria,0,9,7,9,12"},{"type":"open-tria","pattern":"_000__","owner":0,"begin":[9,8],"end":[9,13],"length":6,"hash":"open-tria,0,9,8,9,13"}]}}],"isOver":false,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"extendable-tria","pattern":"000__","owner":0,"begin":[9,9],"end":[9,13],"length":5,"hash":"extendable-tria,0,9,9,9,13"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}]}`)

window.game = game.value

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
  for(const move of makeOrderedMoveIterator(game.value)){
    console.log(move)
  }
  console.log("")
}


</script>




<template>
  <div style="color: white;">Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
  <button @click="profile()">Profile</button><br>
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