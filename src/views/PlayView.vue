<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, loadFromString, gameToString } from '@/engine_v13/model_v13';
import { findBestMove } from '@/engine_v13/engine_v13';

const game = ref(createNewGame(19))
// game.value = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11")

async function playerMove(r: number, c: number){
  if(game.value.currentPlayer === 1 || game.value.isOver) return
  makeMove(game.value, r, c)
  if(game.value.isOver) return
  await new Promise(resolve => setTimeout(resolve, 10))
  const [compR, compC] = findBestMove(game.value, 8).bestVariation[0]
  makeMove(game.value, compR, compC)
}

</script>




<template>
  <button @click="console.log(gameToString(game))">Save Game</button><br>
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