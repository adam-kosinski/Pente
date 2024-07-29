<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove } from '@/engine_v10/model_v10';
import { findBestMove } from '@/engine_v10/engine_v10';

const game = ref(createNewGame(19))

async function playerMove(r: number, c: number){
  if(game.value.currentPlayer === 1 || game.value.isOver) return
  makeMove(game.value, r, c)
  if(game.value.isOver) return
  await new Promise(resolve => setTimeout(resolve, 10))
  const [compR, compC] = findBestMove(game.value)
  makeMove(game.value, compR, compC)
}

</script>




<template>
  <div style="color: white;">Play</div>
  <button @click="console.log(JSON.stringify(game))">Save Game</button><br>
  <button @click="undoMove(game)">Undo Move</button><br>


  <Board class="board" :game="game" :show-coord-labels="false" @make-move="playerMove" />
</template>


<style scoped>

.board {
  position: absolute;
  inset: 0;
  margin: auto;
}
</style>