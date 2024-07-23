<script setup lang="ts">

import { ref, type Ref, onMounted } from 'vue'

const boardSize = ref(19)
const backgroundCanvas: Ref<HTMLCanvasElement | null> = ref(null)

onMounted(() => {
    initBackground()
})

function initBackground() {
    if (!backgroundCanvas.value) return
    const ctx = backgroundCanvas.value.getContext("2d")
    if (!ctx) return


}

</script>



<template>
    <div class="board">
        <template class="row" v-for="r in boardSize">
            <div class="intersection" v-for="c in boardSize">
                <div class="grid-line-box" :class="{ 'last-col': c === boardSize, 'last-row': r === boardSize }"></div>
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
}

.intersection {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
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
</style>