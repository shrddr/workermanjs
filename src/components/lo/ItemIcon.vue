<script>
import {useUserStore} from '../../stores/user'
import {useGameStore} from '../../stores/game'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()
    return { userStore, gameStore }
  },

  props: {
    ik: Number,
    external_link: {
      type: Boolean,
      default: false
    },
    with_name: {
      type: Boolean,
      default: false
    },
  },
}

</script>

<template>
  <a :href="userStore.itemUrl + ik">
    <img :src="`data/icons/item/${ik}.webp`" class="iconitem" :data-key="ik" />
    <template v-if="with_name && gameStore.ready">
      {{ gameStore.uloc.item[ik] }}
    </template>
  </a>
</template>
