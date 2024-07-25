<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { copyGame, createNewGame, makeMove, updateLinearShapes } from '@/model';
import { generateMoves, findBestMove } from '@/engines/engine_v1';

const game = ref(createNewGame(19))

game.value = JSON.parse('{"board":[[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,0,0,1,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"currentPlayer":0,"captures":{"0":0,"1":0},"nMoves":4,"linearShapes":[{"type":"capture-threat","pattern":"_001","owner":1,"begin":[9,8],"end":[9,11],"length":4,"hash":"capture-threat,1,9,8,9,11"},{"type":"open-pair","pattern":"_11_","owner":1,"begin":[11,9],"end":[8,12],"length":4,"hash":"open-pair,1,11,9,8,12"}]}')

</script>




<template>
  <div class="wood-background"></div>
  <div>Analyze</div>
  <button @click="console.log(findBestMove(game))">Find Best Move</button><br>
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