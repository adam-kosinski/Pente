<script setup lang="ts">

const props = defineProps<{ nCaptures: number, gemPlayer: 0 | 1 }>()

</script>


<template>
  <div class="captures-area">
    <div v-for="n in 5">
      <div class="pair-container" :class="{'visible': n <= nCaptures}">
        <div class="gem" :data-player="gemPlayer"></div>
        <div class="gem" :data-player="gemPlayer"></div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.captures-area {
  display: flex;
  justify-content: space-evenly;
  position: absolute;
  width: 100%;

  /* placeholder height, should be set by parent */
  height: 30px;
}

.pair-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  justify-items: center;
  visibility: hidden;
  height: 100%;
  aspect-ratio: 2;
  position: relative;
}
.pair-container.visible {
  visibility: visible;
}
</style>