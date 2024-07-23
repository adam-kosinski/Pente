<script setup lang="ts">

import { ref } from 'vue';
import Board from '@/components/Board.vue';
import { createNewGame, makeMove } from '@/model';

const game = ref(createNewGame(13))

</script>




<template>
  <div>Analyze</div>
  <Board :game="game" @make-move="(r, c) => makeMove(game, game.currentPlayer, r, c)"/>
</template>
