<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { createNewGame, makeMove } from '@/model';

const game = ref(createNewGame(19))

</script>




<template>
  <div class="wood-background"></div>
  <div>Analyze</div>
  <Board class="board" :game="game" @make-move="(r, c) => makeMove(game, game.currentPlayer, r, c)"/>
</template>


<style scoped>
.wood-background {
  position: absolute;
  width: 100vw;
  height: 100vh;
  inset: 0;
  background-image: radial-gradient(transparent 50%, black), url('/wood-texture.jpg');
  z-index: -1;
  /* box-shadow: inset 0 0 100px 10px black; */
}
.board {
  position: absolute;
  inset: 0;
  margin: auto;
}
</style>