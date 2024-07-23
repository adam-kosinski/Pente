<script setup lang="ts">

import { ref, type Ref, onMounted, computed } from 'vue'
import { makeMove, type GameState } from '@/model';

const props = defineProps<{ game: GameState }>()
const emit = defineEmits(["make-move"])

const boardSize = computed(() => props.game.board[0].length)

</script>



<template>
    <div class="board">
        <template class="row" v-for="r in boardSize">
            <div class="intersection" v-for="c in boardSize"
                :class="{ 'center': r === Math.ceil(boardSize / 2) && c === r }"
                @click="$emit('make-move', r - 1, c - 1)">

                <div v-if="game.board[r - 1][c - 1] !== undefined" class="gem" :data-player="game.board[r - 1][c - 1]"></div>
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
    padding: 10px;
    background-color: beige;
    display: grid;
    grid-template-columns: repeat(v-bind('boardSize'), 1fr);
    box-shadow: 0 2px 2px 1px rgba(0, 0, 0, 0.25);
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
    border-left: 1px solid maroon;
    border-top: 1px solid maroon;
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

.center::before {
    content: "";
    position: absolute;
    width: 20%;
    height: 20%;
    border-radius: 100%;
    background-color: maroon;
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