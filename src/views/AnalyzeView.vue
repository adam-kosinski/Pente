<script setup lang="ts">

import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import Board from '@/components/Board.vue';
import AnalysisLine from '@/components/AnalysisLine.vue';

import { generateFeatureCSV, playGame, runCompetition } from '@/computerMatchup';

import { createNewGame, copyGame, makeMove, undoMove, gameToString, loadFromString, type SearchResult, type GameState } from '@/engine_v21/model_v21';
import { makeOrderedMoveIterator, createOpeningBook } from '@/engine_v21/move_generation_v21'
import { evaluatePosition, getNonlinearShapes, positionFeatureDict, evaluateMomentum } from '@/engine_v21/evaluation_v21';
import { TTableKey } from "@/engine_v21/ttable_v21"

import AnalysisWorker from "../analysisWorker?worker"
import { detectSymmetry } from '@/engine_v21/move_generation_v21';
import router from "../router/index"

const showDebug = ref(false)
function toggleDebug(e: KeyboardEvent) {
  if (e.key !== "D") return
  showDebug.value = !showDebug.value
}

const game = ref(createNewGame(19))

const testPositionIndex = ref(0)
const testPositions = [
  "19~9.9",
  "19~9.9|9.7|12.10|7.5|11.7|7.7|10.8|8.10|12.6|13.5|12.8|7.6|12.9|12.7|12.12|12.11|7.8|8.7|6.7|8.9|8.8|5.6|11.8|9.8|9.6",
  "19~9.9|9.10|11.9|7.8|10.11|8.9|10.9|5.8|10.10|5.6|6.7|10.12|10.8",
  "19~9.9|9.7|7.7|7.9|10.6|8.6",
  // cool trap
  "19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9|10.11",
  // used to blunder b/c thought it was dead lost when it wasn't
  "19~9.9|9.8|12.7|7.8|11.7|10.7|8.9|11.6|7.9|6.9|11.9|10.9|11.10|11.11|8.7|10.9|5.10|5.9|6.9|7.8|10.8|8.10|13.7|12.6|14.7|15.7|12.10|9.7|14.12|13.11|14.10|13.10|14.11",
  // variations originally out of order - second variation finds a better result
  "19~9.9|10.10|9.11|9.12|7.9|10.12|8.9|10.9|6.9|5.9|10.11|10.8|8.11|10.7|10.6|7.11|8.12",
  // linear shape update used to be broken
  "19~9.9|11.9|9.7|9.6|9.5|7.4|5.3|5.2|6.2|6.3",
  // (!!!) analyze (-Infinity), then go back one move and analyze -> line switches to +Infinity, but if you follow it to the end, the final position of the +Infinity line is actually -Infinity
  // seems to be fixed after adding the web worker, huh
  // ohhh that's probably because from move to move the transposition table gets reset since the web worker's env gets reset
  "19~9.9|10.9|11.7|8.7|11.10|8.10|11.11|8.8|11.9|11.8|8.6",
  // this line is bizarre
  "19~9.9|11.9|11.6|11.11|11.7|8.10|13.5|11.10|11.12|11.5|11.8|9.10|7.10|12.10|10.10|8.8|10.8|12.6|13.11|9.7|11.9|11.10|12.10|14.12|10.6|9.6|10.6|7.9|9.8|9.9|9.5|7.7|10.10",
  // me beating the v21 engine decisively - oops. From deeper analysis, it seems the game was basically over after move 8
  "19~9.9|10.9|9.11|9.8|11.10|8.7|11.11|8.11|11.12|7.6|6.5|11.13|11.8|11.9|12.9|11.9|12.12|13.13|10.11|9.12|12.11|10.10|11.11|13.11|12.8|11.9|12.10|12.12|12.7",
  // and again! - lost on move 10 by playing 6.9 because didn't look far enough ahead
  "19~9.9|11.10|9.6|8.6|7.9|9.8|7.8|7.10|7.7|6.9|5.8|7.5|8.11|7.10|8.9|6.9|6.7|5.6|8.10|8.8|10.8|6.8|6.10|6.8|8.12|9.11|8.10|8.13|8.8",
  // transposition table bug, thinks white has a forced win
  "19~9.9|9.10|6.9|11.10|6.7|10.10|8.10|10.8|7.11|10.9",
  // on 2+ variations only, thinks white has a forced win
  "19~9.9|10.10|9.6|8.10|7.6|8.12|8.6|10.6"
]
game.value = loadFromString(testPositions[testPositionIndex.value])
watch(testPositionIndex, i => {
  game.value = loadFromString(testPositions[i])
  updateMoveList()
  analyzePosition()
})

function doMakeMove(r: number, c: number) {
  makeMove(game.value, r, c)
  updateMoveList()
  analyzePosition()
}


// move navigation -----------------------

const moveList: Ref<number[][]> = ref([])
const moveIndex = ref(-1)  // -1 if no moves, so that when displaying it reads move 0

function updateMoveList() {
  moveList.value = game.value.prevMoves.map(m => m.addedGems[0])
  moveIndex.value = moveList.value.length - 1
}
function incrementMoveIndex() {
  if (moveIndex.value >= moveList.value.length - 1) return
  moveIndex.value++
  const move = moveList.value[moveIndex.value]
  makeMove(game.value, move[0], move[1])
  analyzePosition()
}
function decrementMoveIndex() {
  if (moveIndex.value <= -1) return
  moveIndex.value--
  undoMove(game.value)
  analyzePosition()
}

// ------------------------------


const analysisLineGameCopy = ref(copyGame(game.value))  // so if the game changes, the analysis lines don't behave weirdly before we give them the next analysis result
const futurePosition: Ref<GameState | undefined> = ref()

function goToPosition(position: GameState) {
  game.value = position
  updateMoveList()
  analyzePosition()
}

function timeTest() {
  const iterations = 1000000
  let start = performance.now()
  // find time that the loop takes by itself
  for (let i = 0; i < iterations; i++) {
  }
  console.log("loop only: ", performance.now() - start + " ms")

  start = performance.now()
  for (let i = 0; i < iterations; i++) {
    19 > 18
  }
  console.log("A:", performance.now() - start + " ms")
  start = performance.now()
  let s = Array(19 * 19).fill("-").join("")
  for (let i = 0; i < iterations; i++) {
    19 === 19
  }
  console.log("B:", performance.now() - start + " ms\n\n")

}

function printMoves() {
  for (const move of makeOrderedMoveIterator(game.value, 1)) {
    console.log(move)
  }
  console.log("")
}
function printForcingMoves() {
  for (const move of makeOrderedMoveIterator(game.value, 1)) {
    console.log(move)
  }
  console.log("")
}

const analysisStarted = ref(false) // don't auto run until the user says to
const nAnalysisVariations = ref(1)
const maxVariations = 4
const results: Ref<SearchResult[]> = ref([])
let analysisWorker: Worker

function analyzePosition() {
  if (!analysisStarted.value) return
  if (analysisWorker) analysisWorker.terminate()
  analysisWorker = new AnalysisWorker()

  analysisWorker.postMessage([JSON.stringify(game.value), nAnalysisVariations.value])
  analysisWorker.onmessage = (e) => {
    results.value = e.data
    analysisLineGameCopy.value = copyGame(game.value)
  }
}

function runComputerGame() {
  window.open(router.resolve("/analyze?s=" + playGame(6, 6, 15, 100).gameString).href, "_blank")
}

onMounted(() => {
  const searchParams = new URL(window.location.href).searchParams
  const gameString = searchParams.get("s")
  if (gameString) game.value = loadFromString(gameString)
  updateMoveList()
  document.addEventListener("keypress", toggleDebug)
})
onUnmounted(() => {
  document.removeEventListener("keypress", toggleDebug)
})


</script>




<template>
  <div class="analyze-view">

    <div class="board-container">
      <Board :game="game" show-coord-labels @make-move="(r, c) => doMakeMove(r, c)" />
    </div>
    <div class="analysis-panel">
      <div class="analysis-panel-top">
        <p class="analysis-title">Analysis</p>
        <button v-if="!analysisStarted" class="start-analysis" @click="analysisStarted = true; analyzePosition();">
          Start Analysis
        </button>
        <AnalysisLine v-if="analysisStarted" v-for="i in nAnalysisVariations" :game="analysisLineGameCopy"
          :result="results[i - 1]" @show-future-position="(position) => futurePosition = position"
          @clear-future-position="futurePosition = undefined" @go-to-position="(position) => goToPosition(position)" />
        <div>
          <button v-if="analysisStarted && nAnalysisVariations < maxVariations" class="add-variation"
            @click="nAnalysisVariations++; analyzePosition()">Add variation</button>
          <button v-if="analysisStarted && nAnalysisVariations > 1" class="remove-variation"
            @click="nAnalysisVariations--; analyzePosition()">Remove variation</button>
        </div>

      </div>
      <div class="future-position-space">
        <div class="future-position-container">
          <Board v-if="futurePosition" :game="futurePosition" :show-coord-labels="true" />
        </div>
      </div>

      <div class="move-navigation">
        <button @click="() => { while (moveIndex > -1) decrementMoveIndex() }">
          <img src="/begin.svg">
        </button>
        <button @click="decrementMoveIndex()">
          <img src="/back.svg">
        </button>
        <div class="move-index-display">
          <p>Move <span>{{ moveIndex + 1 }}</span>/<span>{{ moveList.length }}</span></p>
        </div>
        <button @click="incrementMoveIndex()">
          <img src="/back.svg" style="transform: rotateY(180deg)">
        </button>
        <button @click="() => { while (moveIndex < moveList.length - 1) incrementMoveIndex() }">
          <img src="/begin.svg" style="transform: rotateY(180deg)">
        </button>
      </div>
    </div>

    <div v-if="showDebug" class="button-panel">
      <button @click="printMoves()">Generate Moves</button><br>
      <button @click="printForcingMoves()">Forcing Moves</button><br>
      <button @click="console.log(evaluatePosition(game))">Evaluate</button><br>
      <button @click="console.log(game.linearShapes.map(shape => shape.hash).join('\n'))">Linear Shapes</button><br>
      <button @click="console.log(getNonlinearShapes(game))">Nonlinear Shapes</button><br>
      <button @click="console.log(gameToString(game))">Save Game</button><br>
      <a :href="'/analyze?s=' + gameToString(game)" target="_blank"><button>Analyze in new tab</button></a><br>
      <button @click="console.log(JSON.stringify(game, null, 2))">Game Object</button><br>
      <button @click="console.log(JSON.stringify(game.threatHistory))">Threat History</button><br>
      <button @click="timeTest()">Time Test</button><br>
      <button @click="console.log(positionFeatureDict(game))">Feature Dict</button><br>
      <button @click="runComputerGame()">Play Computer Game</button><br>
      <button @click="runCompetition(6, 7, 30, 30)">Run Competition</button><br>
      <button @click="generateFeatureCSV(Infinity)">Get CSV</button><br>
      <button @click="console.log(detectSymmetry(game))">Symmetry</button><br>
      <button @click="console.log(evaluateMomentum(game, 10))">Evaluate Momentum</button><br>
      <select v-model="testPositionIndex">
        <option v-for="_, i in testPositions" :value="i">Position {{ i }}</option>
      </select>
    </div>
  </div>

</template>



<style scoped>
.analyze-view {
  display: flex;
  gap: 20px;
  justify-content: center;

  width: 100%;
  height: 100%;
  padding: 5vh 20px;
  box-sizing: border-box;
}

.board-container {
  flex: 0 0.75 90vh;
  align-self: flex-start;
}

.analysis-panel {
  flex: 0 1 500px;
  gap: 20px;
  height: 90vh;
  padding: 20px;
  box-sizing: border-box;
  border: 1.5px solid var(--medium-brown);
  background-color: var(--dark-brown);
  color: #fffe;

  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}

.analysis-panel button {
  background-color: var(--medium-brown);
  border: none;
  border-radius: 5px;
  color: white;
  cursor: pointer;
  padding: 10px;
  width: min-content;
  text-wrap: nowrap;
  font-size: 18px;
}

.analysis-panel button:hover {
  background-color: color-mix(in srgb, var(--medium-brown), tan 20%);
}

.analysis-panel-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.analysis-title {
  font-size: 30px;
  text-align: center;
  margin: 0;
  margin-bottom: 10px;
}

.start-analysis {
  margin: auto;
  margin-top: 10px;
  text-wrap: nowrap;
}

.analysis-panel .add-variation,
.analysis-panel .remove-variation {
  background-color: transparent;
  border: 1px solid var(--medium-brown);
}

.remove-variation {
  margin-left: 10px;
}

.future-position-space {
  position: relative;
  min-height: 0;
}

.future-position-container {
  aspect-ratio: 1 / 1;
  max-height: 100%;
  margin: auto;
}

.move-navigation {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  height: 40px;
  text-wrap: nowrap;
  font-size: 18px;
}

.move-navigation button {
  height: 100%;
  flex-grow: 1;
}

.move-navigation p {
  margin: 0 10px;
}

.move-navigation button img {
  height: 100%;
}

.move-index-display {
  min-width: 100px;
  text-align: center;
}

.button-panel {
  position: absolute;
  left: -110px;
  bottom: 0;
}
</style>