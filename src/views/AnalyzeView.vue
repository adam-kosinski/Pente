<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { copyGame, createNewGame, makeMove, updateLinearShapes } from '@/model';
import { generateMoves, findBestMove, evaluatePosition } from '@/engines/engine_v1';

const game = ref(createNewGame(19))

game.value = JSON.parse('{"board":[{},{},{},{},{},{},{},{"11":0},{"10":1},{"8":1,"9":0,"10":0,"11":0},{"9":1,"11":1},{},{},{},{},{},{},{},{}],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":8,"isOver":false,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}]}')
// game.value = JSON.parse('{"board":[{},{},{},{},{},{},{},{"11":0},{"10":1,"12":0},{"8":1,"9":0,"10":0,"11":0,"12":1,"13":0},{"9":1,"11":1},{},{},{},{},{},{},{},{}],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":11,"isOver":false,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[11,10],"end":[8,13],"length":4,"hash":"open-pair,1,11,10,8,13"},{"type":"open-tria","pattern":"_000_","owner":0,"begin":[6,10],"end":[10,14],"length":5,"hash":"open-tria,0,6,10,10,14"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[10,10],"end":[7,13],"length":4,"hash":"open-pair,0,10,10,7,13"}]}')

// game.value = JSON.parse(`
// {"board":[{},{},{},{},{},{},{},{"11":0},{"10":1,"12":0,"13":1},{"8":1,"9":0,"10":0,"11":0,"12":1,"13":0},{"9":1,"11":1,"14":0},{"10":1,"15":0},{},{},{},{},{},{},{}],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":15,"isOver":true,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"open-pair","pattern":"_00_","owner":0,"begin":[10,10],"end":[7,13],"length":4,"hash":"open-pair,0,10,10,7,13"},{"type":"open-tria","pattern":"_111_","owner":1,"begin":[8,7],"end":[12,11],"length":5,"hash":"open-tria,1,8,7,12,11"},{"type":"open-tessera","pattern":"_1111_","owner":1,"begin":[12,9],"end":[7,14],"length":6,"hash":"open-tessera,1,12,9,7,14"},{"type":"pente-threat-4","pattern":"1111_","owner":1,"begin":[11,10],"end":[7,14],"length":5,"hash":"pente-threat-4,1,11,10,7,14"},{"type":"pente-threat-4","pattern":"_0000","owner":0,"begin":[6,10],"end":[10,14],"length":5,"hash":"pente-threat-4,0,6,10,10,14"},{"type":"pente","pattern":"00000","owner":0,"begin":[7,11],"end":[11,15],"length":5,"hash":"pente,0,7,11,11,15"},{"type":"pente-threat-4","pattern":"0000_","owner":0,"begin":[8,12],"end":[12,16],"length":5,"hash":"pente-threat-4,0,8,12,12,16"}]}`)


function profile(){
  console.profile()
  findBestMove(game.value)
  console.profileEnd()
}

function timeTest(){
  const start = performance.now()
  for(let i=0; i<10000; i++){
    copyGame(game.value)
  }
  console.log(performance.now() - start + " ms")
}



</script>




<template>
  <div class="wood-background"></div>
  <div>Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
  <button @click="profile()">Profile</button><br>
  <button @click="console.log(evaluatePosition(game))">Evaluate</button><br>
  <button @click="console.log(game.linearShapes.map(shape => shape.hash).join('\n'))">Get Linear Shapes</button><br>
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="timeTest()">Time Test</button>
  <Board class="board" :game="game" @make-move="(r, c) => makeMove(game, r, c)" />
</template>


<style scoped>
.wood-background {
  position: absolute;
  width: 100vw;
  height: 100vh;
  inset: 0;
  background-image: radial-gradient(transparent 50%, black), url('/wood-texture.jpg');
  z-index: -1;
  /* box-shadow: inset 0 0 100px 10px black; */
}

.board {
  position: absolute;
  inset: 0;
  margin: auto;
}
</style>