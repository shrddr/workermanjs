<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game.js'
import {formatFixed, extractNumbers} from '../util.js'
import ItemIcon from '../components/lo/ItemIcon.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    return { gameStore, userStore }
  },

  props: {
    w: Object,
  },

  components: {
    ItemIcon,
  },

  methods: {
    formatFixed,
    extractNumbers,

    workshop_text(w) {
      const homeTnk = w.tnk

      const houseName = this.gameStore.uloc.char[w.job.hk]
      let houseShort = houseName

      if (homeTnk) {
        const jobNk = this.gameStore.houseInfo[w.job.hk].parentNode
        if (homeTnk == jobNk) {
          houseShort = extractNumbers(houseName)
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
      <template v-for="ik in gameStore.craftOutputs[w.job.recipe]">
        <abbr :title="gameStore.itemName(ik)">
          <ItemIcon :ik="ik"/>
        </abbr>
      </template>
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