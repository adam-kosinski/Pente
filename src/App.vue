<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="wrapper">
    <!-- <div class="wood-background"></div> -->
    <nav>
      <RouterLink to="/" active-class="active-link">Home</RouterLink>
      <RouterLink to="analyze" active-class="active-link">Analyze</RouterLink>
      <RouterLink to="play" active-class="active-link">Play</RouterLink>
    </nav>

    <main>
      <RouterView />
    </main>

  </div>

</template>


<style>
:root {
  --dark-brown: rgb(49, 29, 22);
  --medium-brown: rgb(102, 74, 63);
  --gem-color-0: #ddd;
  --gem-color-1: black;
  --gem-0-contrast: black;
  --gem-1-contrast: #ddd;

  font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;

  /* gem styling shared between board and capture area */
  .gem {
    width: 90%;
    height: 90%;
    border-radius: 90%;
    position: relative;
    z-index: 5;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    background-image: radial-gradient(circle at 35% 35%,
        color-mix(in hsl, white 90%, var(--gem-color)) 0%,
        color-mix(in hsl, white 40%, var(--gem-color)) 15%,
        var(--gem-color) 40%,
        color-mix(in hsl, black 20%, var(--gem-color)) 70%);
  }

  .gem[data-player="0"] {
    --gem-color: var(--gem-color-0);
  }

  .gem[data-player="1"] {
    --gem-color: var(--gem-color-1);
  }
}

body {
  margin: 0;
}
</style>

<style scoped>
.wrapper {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.wood-background {
  position: absolute;
  width: 100vw;
  height: 100vh;
  inset: 0;
  background-image: radial-gradient(transparent 50%, black), url('/wood-texture.jpg');
  z-index: -1;
  display: none;
}

nav {
  background-color: var(--dark-brown);
  border-right: 1.5px solid var(--medium-brown);
  display: flex;
  flex-direction: column;
  width: 8rem;
  padding-top: 15px;
}

nav a {
  font-size: 24px;
  color: #fffa;
  text-decoration: none;
  padding: 15px;
  border-left: 4px solid transparent;
}

nav a:hover {
  cursor: pointer;
  color: white;
}

nav a.active-link {
  color: white;
  border-left-color: white;
}

main {
  background-image: radial-gradient(transparent 50%, black), url('/wood-texture.jpg');
  height: 100%;
  width: 100%;
  position: relative;
}
</style>