<script setup lang="ts">

import { computed, ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, loadFromString, gameToString } from '@/engine_v19/model_v19';
import PlayerWorker from "../playerWorker?worker"

const game = ref(createNewGame(19))
// game.value = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11")

const worker = new PlayerWorker()
const started = ref(false)
const playingAs = ref(0)
const boardDisabled = computed(() => game.value.currentPlayer !== playingAs.value)


function playerMove(r: number, c: number) {
  if (game.value.currentPlayer !== playingAs.value || game.value.isOver) return
  makeMove(game.value, r, c)
  if (game.value.isOver) return
  worker.postMessage(JSON.stringify(game.value))
}
worker.onmessage = (e) => {
  const [compR, compC] = e.data
  makeMove(game.value, compR, compC)
}

function goToAnalysis() {
  window.open("/analyze?s=" + gameToString(game.value), "_blank")
}

function reload() {
  window.location.reload()
}

</script>


<template>
  <div class="choose-player" v-if="!started">
    <p>Play as</p>
    <div class="player-choice" @click="started = true">
      <div class="gem" data-player="0"></div>
      First player
    </div>
    <div class="player-choice" @click="game = loadFromString('19~9.9'); playingAs = 1; started = true;">
      <div class="gem" data-player="1"></div>
      Second player
    </div>
  </div>
  <div class="play" v-if="started">
    <div class="buttons">
      <button class="go-to-analysis" @click="goToAnalysis()">
        <p>Analyze</p><span style="font-size: 2em; transform: rotateZ(-45deg) translateY(-5%);">⚲</span>
      </button>
      <button @click="undoMove(game); undoMove(game)">
        <p>Undo</p><span style="font-size: 2em; transform: translateY(-5%);">⎌</span>
      </button>
      <button @click="reload()">
        <p>New Game</p><span style="font-size: 2em; transform: rotateZ(90deg)">↻</span>
      </button>
    </div>
    <div class="board-container">
      <Board class="board" :game="game" :show-coord-labels="false" :disabled="boardDisabled" @make-move="playerMove" />
    </div>
  </div>

</template>


<style scoped>
.choose-player {
  background-color: tan;
  position: absolute;
  inset: 0;
  margin: auto;
  width: 250px;
  height: min-content;
  padding: 20px;
  font-size: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.choose-player p {
  margin: 0;
  text-align: center;
  font-weight: bold;
  font-size: 36px;
}

.player-choice {
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  padding: 10px;
  border-radius: 10px;
  background-color: color-mix(in srgb, tan, var(--medium-brown) 30%);
}

.player-choice:hover {
  background-color: var(--medium-brown);
  color: white;
}

.choose-player .gem {
  width: 50px;
  height: 50px;
}

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
  top: 15px;
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