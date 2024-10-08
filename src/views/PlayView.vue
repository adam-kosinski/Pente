<script setup lang="ts">

import { computed, ref } from 'vue';
import Board from '@/components/Board.vue';

import { createNewGame, makeMove, undoMove, loadFromString, gameToString } from '@/engine_v21/model_v21';
import PlayerWorker from "../playerWorker?worker"
import router from "../router/index"

const game = ref(createNewGame(19))
// game.value = loadFromString("19~9.9|9.11|9.6|9.13|7.6|7.13|8.6|6.6|10.6|11.6|9.7|9.8|8.8|9.5|9.7|7.9|10.10|11.11|8.7|8.9|6.9|7.9|8.5|6.5")

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
  // need a router resolve so that it picks up on the base URL changing in production
  window.open(router.resolve("/analyze?s=" + gameToString(game.value)).href, "_blank")
}

function reload() {
  window.location.reload()
}

function undoMovePair() {
  undoMove(game.value)
  // if I had just won, then we will only be undoing one move - make sure we undo the correct number of moves
  if (game.value.currentPlayer !== playingAs.value) {
    undoMove(game.value)
  }
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
      <button @click="undoMovePair()">
        <p>Undo</p><span style="font-size: 2em; transform: translateY(-5%);">⎌</span>
      </button>
      <button @click="reload()">
        <p>New Game</p><span style="font-size: 2em; transform: rotateZ(90deg)">↻</span>
      </button>
    </div>
    <div class="board-container">
      <Board class="board" :game="game" :show-coord-labels="false" :disabled="boardDisabled"
        :flip-pair-locations="playingAs === 1" @make-move="playerMove" />
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