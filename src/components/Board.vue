<script setup lang="ts">

import { computed, inject } from 'vue'
import { type GameState, toStandardCoords } from '@/engine_v21/model_v21';
import { isRestricted } from '@/engine_v21/move_generation_v21';
import CapturesArea from './CapturesArea.vue';

interface Props {
  game: GameState
  showCoordLabels: boolean
  disabled?: boolean
  flipPairLocations?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits(["make-move"])

const useStandardCoords = inject("useStandardCoords")

const boardSize = computed(() => props.game.board.length)
const center = computed(() => Math.floor(boardSize.value / 2))
const lastMove = computed(() => props.game.prevMoves.slice(-1)[0]?.addedGems[0])

function areCoordsSignificant(r: number, c: number): boolean {
  if (r === center.value && c === center.value) return true
  if (Math.abs(r - center.value) === 3 && Math.abs(c - center.value) === 3) return true;
  return false
}

function isLegalMove(r: number, c: number) {
  if (props.game.isOver) return false
  if (props.game.board[r][c] !== undefined) return false
  if (props.game.nMoves === 0 && (r !== center.value || c !== center.value)) return false
  if (isRestricted(props.game, r, c)) return false
  return true
}

function tryToMakeMove(r: number, c: number) {
  if (props.disabled) return
  if (!isLegalMove(r, c)) return
  emit('make-move', r, c)
}


</script>



<template>
  <div class="board-element">
    <img class="board-background" src="/leather-texture.jpg" />
    <template class="row" v-for="r in boardSize">
      <div class="intersection" v-for="c in boardSize"
        :class="{ 'significant': areCoordsSignificant(r - 1, c - 1), 'last-col': c === boardSize, 'last-row': r === boardSize, 'legal-move': isLegalMove(r - 1, c - 1) }"
        @click="tryToMakeMove(r - 1, c - 1)">

        <p v-if="c === 1 && showCoordLabels" class="row-label">{{ useStandardCoords ?
          toStandardCoords(r - 1, c - 1, game.board.length)[1] : r - 1 }}</p>
        <p v-if="r === boardSize && showCoordLabels" class="col-label">{{ useStandardCoords ?
          toStandardCoords(r - 1, c - 1, game.board.length)[0] : c - 1 }}</p>

        <div v-if="game.board[r - 1][c - 1] !== undefined" class="real gem" :data-player="game.board[r - 1][c - 1]"
          :class="{ 'last-move': r - 1 === lastMove[0] && c - 1 === lastMove[1] }">
        </div>
        <div v-else-if="!disabled" class="ghost gem" :data-player="game.currentPlayer"></div>

        <div class="grid-line-box"></div>
      </div>
    </template>
    <CapturesArea class="captures top" :n-captures="game.captures[flipPairLocations ? 0 : 1]"
      :gemPlayer="flipPairLocations ? 1 : 0" />
    <CapturesArea class="captures bottom" :n-captures="game.captures[flipPairLocations ? 1 : 0]"
      :gemPlayer="flipPairLocations ? 0 : 1" />
  </div>
</template>

<style scoped>
.board-wrapper {
  height: 100%;
  width: auto;
  aspect-ratio: 1 / 1;
  align-self: center;
}

.board-element {
  height: 100%;
  max-height: 90vh;
  width: auto;
  aspect-ratio: 1 / 1;
  /* need to override align stretch, so will play nice with flexbox and grid layouts */
  align-self: center;
  --intersection-size: calc(100% / v-bind('boardSize + 3'));

  box-sizing: border-box;
  position: relative;
  --grid-line-width: 1px;
  --grid-line-color: rgba(128, 0, 0, 0.8);
  border: 10px solid rgb(102, 74, 63);

  background-color: tan;
  display: grid;
  grid-template-columns: repeat(v-bind('boardSize'), var(--intersection-size));
  grid-template-rows: repeat(v-bind('boardSize'), var(--intersection-size));
  justify-content: center;
  align-content: center;
  box-shadow: 4px 4px 4px 1px rgba(0, 0, 0, 0.5);

  color: black;
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
  cursor: v-bind("disabled ? 'default' : 'pointer'");
  /* define container for making the row/col labels fit */
  container-type: inline-size;
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

.gem.last-move {
  box-shadow: 0 0 4px 4px white;
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
  font-size: min(12px, 80cqi);
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
  top: 1%;
}

.captures.bottom {
  bottom: 1%;
}
</style>