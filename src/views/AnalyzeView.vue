<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { copyGame, createNewGame, makeMove, updateLinearShapes } from '@/model';
import { generateMoves, findBestMove, evaluatePosition } from '@/engines/engine_v1';

const game = ref(createNewGame(19))

game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,1,0,0,0,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,1,null,1,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":8,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"}]}')
// game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,0,null,0,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,0,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,1,0,0,0,1,0,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,1,null,1,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":13,"linearShapes":[{"type":"stretch-two","pattern":"_1_1_","owner":1,"begin":[10,8],"end":[10,12],"length":5,"hash":"stretch-two,1,10,8,10,12"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[8,7],"end":[11,10],"length":4,"hash":"open-pair,1,8,7,11,10"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[11,10],"end":[8,13],"length":4,"hash":"open-pair,1,11,10,8,13"},{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[7,10],"end":[7,14],"length":5,"hash":"stretch-two,0,7,10,7,14"},{"type":"stretch-two","pattern":"_0_0_","owner":0,"begin":[6,13],"end":[10,13],"length":5,"hash":"stretch-two,0,6,13,10,13"},{"type":"open-tria","pattern":"_000_","owner":0,"begin":[10,10],"end":[6,14],"length":5,"hash":"open-tria,0,10,10,6,14"}]}')

</script>




<template>
  <div class="wood-background"></div>
  <div>Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
  <button @click="console.log(evaluatePosition(game))">Evaluate</button><br>
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="updateLinearShapes(game, 9, 15)">Update Linear Shapes</button>
  <button @click="console.log(copyGame(game))">Copy Game</button>
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