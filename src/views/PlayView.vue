<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, loadFromString, gameToString } from '@/engine_v19/model_v19';
import { chooseMove } from '@/engine_v19/engine_v19';

const game = ref(createNewGame(19))
// game.value = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11")

async function playerMove(r: number, c: number){
  if(game.value.currentPlayer === 1 || game.value.isOver) return
  makeMove(game.value, r, c)
  if(game.value.isOver) return
  await new Promise(resolve => setTimeout(resolve, 10))
  const [compR, compC] = chooseMove(game.value, 10, 1000)
  makeMove(game.value, compR, compC)
}

function goToAnalysis(){
  window.location.href = "/analyze?s=" + gameToString(game.value)
}

</script>




<template>
  <button @click="console.log(gameToString(game))">Save Game</button><br>
  <button @click="undoMove(game)">Undo Move</button><br>
  <button class="go-to-analysis" @click="goToAnalysis()">
    <p>Analyze</p><span style="transform: rotateZ(-45deg) translateY(-5%); font-size: 2em;">&#9906;</span>
  </button><br>

  <div class="board-container">
    <Board class="board" :game="game" :show-coord-labels="false" @make-move="playerMove" />
  </div>
</template>


<style scoped>

.board-container {
  width: min(90vh, calc(100% - 80px));
  height: auto;
  aspect-ratio: 1;
  position: absolute;
  inset: 0;
  margin: auto;
}
.go-to-analysis {
  position: absolute;
  top: 0;
  right: 10px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  color: white;

  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;

  opacity: 0.5;
}
.go-to-analysis p {
  visibility: hidden;
}
.go-to-analysis:hover {
  opacity: 1;
}
.go-to-analysis:hover p {
  visibility: visible;
}
</style>