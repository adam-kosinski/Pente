<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, updateLinearShapes } from '@/engine_v8/model_v8';
import { findBestMove, evaluatePosition, makeOrderedMoveIterator } from '@/engine_v8/engine_v8';

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
  <Board class="board" :game="game" :show-coord-labels="false" @make-move="playerMove" />
</template>


<style scoped>

.board {
  position: absolute;
  inset: 0;
  margin: auto;
}
</style>