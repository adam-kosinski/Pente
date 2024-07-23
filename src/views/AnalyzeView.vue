<script setup lang="ts">

import Board from '@/components/Board.vue';
import { createNewGame } from '@/model';

const game = createNewGame(13)

</script>




<template>
  <div>Analyze</div>
  <Board :game="game" />
</template>
