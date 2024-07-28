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

  <div class="wood-background"></div>


  <RouterView />
  </div>
  
</template>


<style scoped>
.wrapper {
  padding: 16px;
}
.wood-background {
  position: absolute;
  width: 100vw;
  height: 100vh;
  inset: 0;
  background-image: radial-gradient(transparent 50%, black), url('/wood-texture.jpg');
  z-index: -1;
}
</style>