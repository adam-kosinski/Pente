<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { copyGame, createNewGame, makeMove } from '@/model';
import { generateMoves, findBestMove, findLinearShapes, updateLinearShapes } from '@/engines/engine_v1';

const game = ref(createNewGame(19))


// daddy and me forced loss
// game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,0,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,1,0,0,0,1,0,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,1,null,1,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":11}')
// slightly farther ahead
// game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,0,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,1,0,0,0,1,0,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,1,null,1,null,null,0,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":1,"captures":{"0":0,"1":0},"nMoves":13}')

// linear shape test
// game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,0,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,0,null,0,null,1,null,null,null,null,null,1,null],[null,null,null,null,null,null,null,null,0,0,1,null,null,null,null,null,1,null,null],[null,null,null,null,null,null,null,null,1,0,0,null,null,null,null,1,null,1,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,1,1,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,1,null],[null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,1,null,null,1],[null,null,null,null,0,null,null,null,0,null,0,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,0,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":24,"linearShapes":[]}')

</script>




<template>
  <div class="wood-background"></div>
  <div>Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="updateLinearShapes(game, 9, 15)">Update Linear Shapes</button>
  <button @click="console.log(copyGame(game))">Copy Game</button>
  <Board class="board" :game="game" @make-move="(r, c) => makeMove(game, r, c)"/>
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