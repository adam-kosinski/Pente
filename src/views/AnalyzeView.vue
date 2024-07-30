<script setup lang="ts">

import { onMounted, ref, type Ref } from 'vue';
import Board from '@/components/Board.vue';

// import { createNewGame, makeMove, undoMove, updateLinearShapes, moveString, loadFromString } from '@/engine_v10/model_v10';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator, getNonQuietMoves } from '@/engine_v10/engine_v10';

// import { createNewGame, makeMove, undoMove, updateLinearShapes, moveString, loadFromString } from '@/engine_v11/model_v11';
// import { findBestMove, evaluatePosition, makeOrderedMoveIterator, getNonQuietMoves } from '@/engine_v11/engine_v11';
// v11 is busted at depth 11 on this position:
// game.value = loadFromString("19~9.9|9.8|11.9|10.9|8.7|11.10|11.7|13.12|12.11|10.8|10.7")
// eval = 0 [[10,10],[8,8],[9,8],[11,11],[9,10],[9,9],[10,8],[9,9],[12,11],[9,12]] BUT the third move [9,8] is illegal

import { createNewGame, makeMove, undoMove, updateLinearShapes, gameToString, loadFromString, type SearchResult, type GameState } from '@/engine_v12/model_v12';
import { findBestMove, evaluatePosition, makeOrderedMoveIterator, getNonQuietMoves, copyGame } from '@/engine_v12/engine_v12';
import AnalysisLine from '@/components/AnalysisLine.vue';


const game = ref(createNewGame(19))

// v12 thinks this lost-in-2 position is a win, b/c somehow the opponent will decide not to complete pente
// game.value = loadFromString("19~9.9|9.7|12.10|7.5|11.7|7.7|10.8|8.10|12.6|13.5|12.8|7.6|12.9|12.7|12.12|12.11|7.8|8.7|6.7|8.9|8.8|5.6|11.8|9.8|9.6")

// v12 blunders pente-in-1 here, again for some reason it thinks the opponent will go and do something else besides completing pente
game.value = loadFromString("19~9.9|9.10|11.9|7.8|10.11|8.9|10.9|5.8|10.10|5.6|6.7|10.12|10.8")


// cool trap
// game.value = loadFromString("19~9.9|9.7|11.9|11.5|11.7|10.6|8.8|7.7|10.10|12.4|13.3|9.11|12.8|13.9|12.8|11.11|10.9")

// game.value = loadFromString("19~9.9|10.9|9.11|8.10|7.11|10.11|9.10|9.8")
// game.value = loadFromString("19~9.9|9.8|11.9|10.9|8.7|11.10|11.7|13.12|12.11|10.8|10.7")


const analysisLineGameCopy = ref(copyGame(game.value))  // so if the game changes, the analysis lines don't behave weirdly before we give them the next analysis result
const futurePosition: Ref<GameState | undefined> = ref()


declare global {
  interface Console {
    profile: () => any
    profileEnd: () => any
  }
}
function profile() {
  console.profile()
  findBestMove(game.value)
  console.profileEnd()
}

function timeTest() {
  const start = performance.now()
  // const query = "__11_1_00__"
  // const big_re = /(?=(11111|00000|_1111_|_0000_|1111_|_1111|0000_|_0000|111_1|1_111|000_0|0_000|11_11|00_00|_111_|_000_|_11_1_|_1_11_|_00_0_|_0_00_|0111__|__1110|1000__|__0001|_11_|_00_|100_|_001|011_|_110|_1_1_|_0_0_))/g
  // const compressed = /(?=(1{5}|0{5}|_1{4}_|_0{4}_|1{4}_|_1{4}|0{4}_|_0{4}|1{3}_1|1_1{3}|0{3}_0|0_0{3}|1{2}_1{2}|0{2}_0{2}|_1{3}_|_0{3}_|_1{2}_1_|_1_1{2}_|_0{2}_0_|_0_0{2}_|01{3}__|__1{3}0|10{3}__|__0{3}1|_1{2}_|_0{2}_|10{2}_|_0{2}1|01{2}_|_1{2}0|_1_1_|_0_0_))/g
  // const noFlip = /(?=(11111|00000|_1111_|_0000_|1111_|0000_|111_1|000_0|11_11|00_00|_111_|_000_|_11_1_|_00_0_|0111__|1000__|01_11_|10_00_|011_1_|100_0_|_11_|_00_|100_|011_|_1_1_|_0_0_))/g
  // const first_half = /(?=(11111|_1111_|1111_|_1111|111_1|1_111|_11_1_|_1_11_|0111__|__1110|11_11|100_|_110|_1_1_|_111_|_00_))/g
  // const second_half = /(?=(_000_|00000|0000_|_0000_|_0000|000_0|0_000|00_00|_00_0_|011_|_0_00_|1000__|__0001|_001|_0_0_|_11_))/g

  // const most = /(?=(11111|00000|_1111_|_0000_|1111_|_1111|0000_|_0000|111_1|1_111|000_0|0_000|11_11|00_00|_111_|_000_|_11_1_|_1_11_|_00_0_|_0_00_|0111__|__1110|1000__|__0001|100_|_001|011_|_110|_1_1_|_0_0_))/g
  // const pairs = /(?=(_11_|_00_))/g

  // const big_re_capture = /(?=(11111|00000|_1111_|_0000_|1111_|_1111|0000_|_0000|111_1|1_111|000_0|0_000|11_11|00_00|_111_|_000_|(_11_)1_|_1_11_|(_00_)0_|_0_00_|0111__|__1110|1000__|__0001|_11_|_00_|100_|_001|011_|_110|_1_1_|_0_0_))/g

  // const all_re = [
  //  /11111/,/00000/,/_1111_/,/_0000_/,/1111_/,/_1111/,/0000_/,/_0000/,/111_1/,/1_111/,/000_0/,/0_000/,/11_11/,/00_00/,/_111_/,/_000_/,/_11_1_/,/_1_11_/,/_00_0_/,/_0_00_/,/0111__/,/__1110/,/1000__/,/__0001/,/_11_/,/_00_/,/100_/,/_001/,/011_/,/_110/,/_1_1_/,/_0_0_/ 
  // ]
  for (let i = 0; i < 20000; i++) {
    updateLinearShapes(game.value, 10, 10)
  }
  console.log(performance.now() - start + " ms")
}

function printMoves() {
  for (const move of makeOrderedMoveIterator(game.value, 1)) {
    console.log(move)
  }
  console.log("")
}

const result: Ref<SearchResult | undefined> = ref(undefined)
function analyzePosition() {
  result.value = findBestMove(game.value, true)
  analysisLineGameCopy.value = copyGame(game.value)
}
onMounted(() => {
  // analyzePosition()
})


</script>




<template>
  <div class="analyze-view">

    <div class="board-container">
      <Board :game="game" show-coord-labels @make-move="(r, c) => { makeMove(game, r, c) }" />
    </div>
    <div class="analysis-panel">
      <p class="analysis-title">Analysis</p>
      <div class="analysis-lines">
        <AnalysisLine :game="analysisLineGameCopy" :result="result" @show-future-position="(position) => futurePosition = position"
          @clear-future-position="futurePosition = undefined" @go-to-position="(position) => game = position" />
      </div>
      <div class="future-position-container">
        <Board v-if="futurePosition" :game="futurePosition" :show-coord-labels="true" />
      </div>
      <div class="button-panel">
        <button @click="analyzePosition()">Find Best Move</button><br>
        <button @click="profile()">Profile</button><br>
        <button @click="console.log(JSON.stringify(getNonQuietMoves(game)))">Get QS Moves</button><br>
        <button @click="printMoves()">Generate Moves</button><br>
        <button @click="console.log(evaluatePosition(game))">Evaluate</button><br>
        <button @click="undoMove(game)">Undo Move</button><br>
        <button @click="console.log(game.linearShapes.map(shape => shape.hash).join('\n'))">Get Linear
          Shapes</button><br>
        <button @click="console.log(gameToString(game))">Save Game</button><br>
        <button @click="console.log(game)">Game Object</button><br>
        <button @click="timeTest()">Time Test</button>
      </div>
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
  height: 90vh;
  padding: 20px;
  box-sizing: border-box;
  border: 1.5px solid var(--medium-brown);
  background-color: var(--dark-brown);
  color: #fffe;

  display: flex;
  flex-direction: column;
  gap: 20px;
}

.analysis-title {
  font-size: 30px;
  text-align: center;
  margin: 0;
}

.future-position-container {
  position: relative;
  width: 100%;
}
.future-position-container > div {
  position: absolute;
}
</style>