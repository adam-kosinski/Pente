<script setup lang="ts">

import { ref, type Ref, onMounted, computed } from 'vue'
import { makeMove, type GameState } from '@/model';

const props = defineProps<{ game: GameState }>()
const emit = defineEmits(["make-move"])

const boardSize = computed(() => props.game.board[0].length)

function areCoordsSignificant(r: number, c: number): boolean {
    const center = Math.floor(boardSize.value / 2)
    if (r === center && c === center) return true
    if (Math.abs(r - center) === 3 && Math.abs(c - center) === 3) return true;
    return false
}


</script>



<template>
    <div class="board">
        <img class="board-background" src="/leather-texture.jpg" />
        <template class="row" v-for="r in boardSize">
            <div class="intersection" v-for="c in boardSize" :class="{ 'significant': areCoordsSignificant(r - 1, c - 1) }"
                @click="$emit('make-move', r - 1, c - 1)">

                <div v-if="game.board[r - 1][c - 1] !== undefined" class="gem" :data-player="game.board[r - 1][c - 1]">
                </div>
                <div class="grid-line-box" :class="{ 'last-col': c === boardSize, 'last-row': r === boardSize }">

                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.board {
    width: 600px;
    height: 600px;
    position: relative;
    padding: 30px;
    --grid-line-width: 1px;
    --grid-line-color: maroon;

    background-color: tan;
    display: grid;
    grid-template-columns: repeat(v-bind('boardSize'), 1fr);
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

.intersection:has(.gem) {
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

.grid-line-box.last-col {
    border-top: none;
}

.grid-line-box.last-row {
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

.gem {
    width: 90%;
    height: 90%;
    border-radius: 90%;
    position: relative;
    z-index: 5;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    /* background color comes from config in main.css */
}
</style>