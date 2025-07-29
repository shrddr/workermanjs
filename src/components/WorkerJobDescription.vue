<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {formatFixed, extractNumbers, makeIconSrc} from '../util.js'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    return { gameStore, userStore }
  },

  props: {
    w: Object,
  },

  methods: {
    formatFixed,
    extractNumbers,
    makeIconSrc,

    workshop_text(w) {
      const contextTnk = w.tnk

      const houseName = this.gameStore.uloc.char[w.job.hk]
      let houseShort = extractNumbers(houseName)

      if (contextTnk) {
        const houseTk = this.gameStore.houseInfo[w.job.hk].affTown
        const houseTnk = this.gameStore.tk2tnk(houseTk)
        if (contextTnk != houseTnk) {
          houseShort = this.gameStore.nodeName(houseTnk) + ' ' + houseShort
        }
      }
      return `${houseShort} ${this.userStore.userWorkshops[w.job.hk].label}`  // + w.job.recipe
    },


  },
  
}
</script>

<template>
  <template v-if="gameStore.jobIsIdle(w.job)">
    idle
  </template>
  <template v-else-if="gameStore.jobIsPz(w.job)">
    {{ gameStore.uloc.node[w.job.pzk] }}
  </template>
  <template v-else-if="gameStore.jobIsFarming(w.job)">
    [{{ gameStore.jobIcon(w.job) }}]
  </template>
  <template v-else-if="gameStore.jobIsCustom(w.job)">
    [{{ gameStore.jobIcon(w.job) }}] {{ w.job.label }}
  </template>
  <template v-else-if="gameStore.jobIsWorkshop(w.job)">

     <template v-if="w.job.recipe && gameStore.craftOutputs[w.job.recipe]">
      <a :href="userStore.itemUrl + gameStore.craftOutputs[w.job.recipe]">
        <img :src="makeIconSrc(gameStore.craftOutputs[w.job.recipe])" class="iconitem" :data-key="gameStore.craftOutputs[w.job.recipe]" />
      </a>
    </template>
    <template v-else>
      [{{ gameStore.jobIcon(w.job) }}]
    </template>

    {{ workshop_text(w) }}
    
  </template>
  <template v-else>
    UNKNOWN_JOBTYPE
  </template>
</template>