<script>
import {useGameStore} from '../../stores/game'

export default {
  setup() {
    const gameStore = useGameStore()
    return { gameStore }
  },

  props: {
    nodeKey: Number,
  },
}

</script>

<template>
  <RouterLink tag="a" :to="{path: './', hash: '#node' + nodeKey}">
    {{ gameStore.plantzoneName(nodeKey) }}
  </RouterLink>
</template>
