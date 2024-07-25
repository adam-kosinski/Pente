<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { copyGame, createNewGame, makeMove, updateLinearShapes } from '@/model';
import { generateMoves, findBestMove, evaluatePosition } from '@/engines/engine_v1';

const game = ref(createNewGame(19))

makeMove(game.value, 9, 9)
makeMove(game.value, 10, 9)
makeMove(game.value, 9, 11)
makeMove(game.value, 8, 10)
makeMove(game.value, 7, 11)
makeMove(game.value, 10, 11)
makeMove(game.value, 9, 10)
makeMove(game.value, 9, 8)

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
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="updateLinearShapes(game, 9, 15)">Update Linear Shapes</button><br>
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