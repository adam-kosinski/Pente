<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="wrapper">
    <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="analyze">Analyze</RouterLink>
    <RouterLink to="play">Play</RouterLink>
  </nav>

  <RouterView />
  </div>
  
</template>


<style scoped>
.wrapper {
  padding: 16px;
}
</style>