<script setup lang="ts">
import { copyGame } from '@/engine_v16_diag_orthog/engine_v16';
import { type SearchResult, type GameState, createNewGame, makeMove } from '@/engine_v16_diag_orthog/model_v16';
import { computed, ref } from 'vue';

const props = defineProps<{ result: SearchResult | undefined, game: GameState }>()
interface Emits {
  (event: "show-future-position", position: GameState): void
  (event: "clear-future-position"): void
  (event: "go-to-position", position: GameState): void
}
const emit = defineEmits<Emits>()

const evalString = computed(() => {
  if (props.result === undefined) return "..."
  const flagChar = props.result.evalFlag === "exact" ? "" : props.result.evalFlag === "upper-bound" ? "≤" : "≥"
  const sign = props.result.eval > 0 ? "+" : ""
  return flagChar + " " + sign + props.result.eval.toPrecision(3)
})

function getFuturePosition(moveIndex: number) {
  if (!props.result) return createNewGame(19)  // shouldn't happen, but fallback
  const gameCopy = copyGame(props.game)
  for (let i = 0; i <= moveIndex; i++) {
    const m = props.result.bestVariation[i]
    makeMove(gameCopy, m[0], m[1])
  }
  return gameCopy
}

</script>


<template>
  <div class="analysis-line">
    <div class="eval" :class="{ 'player-1-winning': props.result && props.result.eval < 0 }">{{ evalString }}</div>
    <div v-if="result" class="move-container">
      <div class="move" v-for="m, i in result.bestVariation" @mouseenter="result && emit('show-future-position', getFuturePosition(i))"
        @mouseleave="emit('clear-future-position')" @click="emit('go-to-position', getFuturePosition(i))">
        {{ m[0] + "." + m[1] }}
      </div>
    </div>
  </div>
</template>


<style scoped>
.analysis-line {
  display: flex;
  align-items: center;
  gap: 5px;
  background-color: rgba(0, 0, 0, 0.4);
  padding: 10px;
  border-radius: 15px;
}

.eval {
  align-self: flex-start;
  background-color: var(--gem-color-0);
  color: var(--gem-0-contrast);
  border: 1px solid color-mix(var(--gem-0-contrast), transparent);
  border-radius: 30px;
  padding: 5px;
  text-wrap: nowrap;
}
.eval.player-1-winning {
  background-color: var(--gem-color-1);
  color: var(--gem-1-contrast);
  border: 1px solid color-mix(in srgb, var(--gem-1-contrast) 75%, transparent);
}

.move-container {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
}

.move {
  cursor: pointer;
  padding: 5px 5px;
}

.move:hover {
  background-color: tan;
  border-radius: 5px;
  color: black;
}

.future-position {
  position: absolute;
}

.mini-board {
  width: 400px;
}
</style>