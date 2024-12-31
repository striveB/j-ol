<script setup lang="ts">
import JMap from '@j-ol/core'
import { onMounted } from 'vue';
onMounted(() => {
  const jMap = new JMap()
  jMap.initMap('map')
})
</script>

<template>
  <div id="map"></div>
</template>

<style scoped>
#map {
  width: 100vw;
  height: 100vh;
}
</style>
