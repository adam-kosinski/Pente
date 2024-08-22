<script setup lang="ts">

import { onMounted, ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, loadFromString, gameToString } from '@/engine_v19/model_v19';
import { chooseMove } from '@/engine_v19/engine_v19';

const game = ref(createNewGame(19))
// game.value = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11")

async function playerMove(r: number, c: number) {
  if (game.value.currentPlayer === 1 || game.value.isOver) return
  makeMove(game.value, r, c)
  if (game.value.isOver) return
  await new Promise(resolve => setTimeout(resolve, 10))
  const [compR, compC] = chooseMove(game.value, 10, 1000)
  makeMove(game.value, compR, compC)

  window.history.replaceState(null, "", "?s=" + gameToString(game.value))
}

function goToAnalysis() {
  window.location.href = "/analyze?s=" + gameToString(game.value)
}

onMounted(() => {
  const searchParams = new URL(window.location.href).searchParams
  const gameString = searchParams.get("s")
  if (gameString) game.value = loadFromString(gameString)
})

</script>




<template>
  <div class="buttons">
    <button class="go-to-analysis" @click="goToAnalysis()">
      <p>Analyze</p><span style="transform: rotateZ(-45deg) translateY(-5%); font-size: 2em;">&#9906;</span>
    </button>
    <button @click="undoMove(game); undoMove(game)">
      <p>Undo</p><span style="font-size: 2em;">⎌</span>
    </button>
  </div>


  <div class="board-container">
    <Board class="board" :game="game" :show-coord-labels="false" @make-move="playerMove" />
  </div>
</template>


<style scoped>
.board-container {
  width: min(90vh, calc(100% - 120px));
  height: auto;
  aspect-ratio: 1;
  position: absolute;
  inset: 0;
  margin: auto;
}

.buttons {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 5px;
  flex-direction: column;
  align-items: flex-end;
}
.buttons button {
  background-color: transparent;
  border: none;
  color: white;
  cursor: pointer;
  height: 30px;

  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;

  opacity: 0.5;
}
.buttons button p {
  visibility: hidden;
}
.buttons button:hover {
  opacity: 1;
}
.buttons button:hover p {
  visibility: visible;
}

</style>