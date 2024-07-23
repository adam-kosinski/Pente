<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="analyze">Analyze</RouterLink>
    <RouterLink to="play">Play</RouterLink>
  </nav>

  <RouterView />
</template>
