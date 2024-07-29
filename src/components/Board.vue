<script setup lang="ts">

import { computed } from 'vue'
import { type GameState } from '@/engine_v8/model_v8';
import CapturesArea from './CapturesArea.vue';

const props = defineProps<{ game: GameState, showCoordLabels: boolean }>()
const emit = defineEmits(["make-move"])

const boardSize = computed(() => props.game.board.length)
const center = computed(() => Math.floor(boardSize.value / 2))

function areCoordsSignificant(r: number, c: number): boolean {
  if (r === center.value && c === center.value) return true
  if (Math.abs(r - center.value) === 3 && Math.abs(c - center.value) === 3) return true;
  return false
}

function isLegalMove(r: number, c: number) {
  if (props.game.isOver) return false
  if (props.game.board[r][c] !== undefined) return false
  if (props.game.nMoves === 0 && (r !== center.value || c !== center.value)) return false
  return true
}

function tryToMakeMove(r: number, c: number) {
  if (!isLegalMove(r, c)) return
  emit('make-move', r, c)
}


</script>



<template>
  <div class="board">
    <img class="board-background" src="/leather-texture.jpg" />
    <template class="row" v-for="r in boardSize">
      <div class="intersection" v-for="c in boardSize"
        :class="{ 'significant': areCoordsSignificant(r - 1, c - 1), 'last-col': c === boardSize, 'last-row': r === boardSize, 'legal-move': isLegalMove(r - 1, c - 1) }"
        @click="tryToMakeMove(r - 1, c - 1)">

        <p v-if="c === 1 && showCoordLabels" class="row-label">{{ r - 1 }}</p>
        <p v-if="r === boardSize && showCoordLabels" class="col-label">{{ c - 1 }}</p>

        <div v-if="game.board[r - 1][c - 1] !== undefined" class="real gem" :data-player="game.board[r - 1][c - 1]">
        </div>
        <div v-else class="ghost gem" :data-player="game.currentPlayer"></div>

        <div class="grid-line-box"></div>
      </div>
    </template>
    <CapturesArea class="captures top" :n-captures="game.captures[1]" :gemPlayer="0"  />
    <CapturesArea class="captures bottom" :n-captures="game.captures[0]" :gemPlayer="1" />
  </div>
</template>

<style scoped>
.board {
  --board-width: 90vh;
  width: var(--board-width);
  height: var(--board-width);
  --intersection-size: calc(var(--board-width) / v-bind('boardSize + 3'));

  box-sizing: border-box;
  position: relative;
  --grid-line-width: 0.15vh;
  --grid-line-color: maroon;
  border: 1.5vh solid rgb(102, 74, 63);

  background-color: tan;
  display: grid;
  grid-template-columns: repeat(v-bind('boardSize'), var(--intersection-size));
  grid-template-rows: repeat(v-bind('boardSize'), var(--intersection-size));
  justify-content: center;
  align-content: center;
  box-shadow: 4px 4px 4px 1px rgba(0, 0, 0, 0.5);
}

.board-background {
  position: absolute;
  width: 100%;
  max-height: 100%;
  opacity: 0.3;
}

.intersection {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
}

.intersection:not(.legal-move) {
  cursor: default;
}

.grid-line-box {
  border-left: var(--grid-line-width) solid var(--grid-line-color);
  border-top: var(--grid-line-width) solid var(--grid-line-color);
  width: 100%;
  height: 100%;
  position: absolute;
  transform: translate(50%, 50%);
}

.last-col .grid-line-box {
  border-top: none;
}

.last-row .grid-line-box {
  border-left: none;
}

.intersection.significant::before {
  content: "";
  position: absolute;
  width: 25%;
  height: 25%;
  border: var(--grid-line-width) double var(--grid-line-color);
  transform: rotateZ(45deg);
}

.ghost.gem {
  opacity: 0.5;
  display: none;
}

.intersection.legal-move:hover .gem.ghost {
  display: block;
}

.row-label,
.col-label {
  position: absolute;
  font-family: sans-serif;
  font-size: 12px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-label {
  transform: translateX(-50%);
}

.col-label {
  transform: translateY(50%);
}

.captures {
  height: var(--intersection-size);
}
.captures.top {
  top: 1vh;
}
.captures.bottom {
  bottom: 1vh;
}
</style>