<script>
import {useGameStore} from '../stores/game.js'
import {useUserStore} from '../stores/user.js'
import Worker from '../components/Worker.vue'
import {formatFixed} from '../util.js'

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore }
  },

  props: {
    tk: Number,
  },

  emits: [
    'selectWorker',
    'editWorker',
  ],

  components: {
    
  },

  data: () => ({
  }),

  computed: {
    filteredHouses() {
      const ret = {}
      for (const [hk, v] of Object.entries(this.userStore.userWorkshops)) {
        const hi = this.gameStore.houseInfo[hk]
        if (!hi) throw Error(`unknown house ${hk}`)
        if (hi.affTown == this.tk) {
          if (v.industry in ret)
            ret[v.industry][hk] = v
          else
            ret[v.industry] = {[hk]: v}
        }
      }
      return ret
    },

    filteredWorkers() {
      return this.userStore.userWorkers.filter(w => w.job && 
        this.gameStore.jobIsWorkshop(w.job) && 
        w.job.hk in this.gameStore.houseInfo && 
        this.gameStore.houseInfo[w.job.hk].affTown == this.tk
      )
    },
  },

  methods: {
    formatFixed,

    
  },
}

</script>

<template>
  <details v-if="Object.keys(filteredHouses).length">
    <summary>Workshops</summary>

    <table>
      <tr>
        <td>house</td>
        <td>type</td>
        <td>workload</td>
        <td>$/cycle</td>
        <td>CP</td>
        <td colspan="3">worker</td>
      </tr>

      <template v-for="houses, industry in filteredHouses">
        
        <tr v-for="v, hk in houses">
          <td>
            {{ gameStore.uloc.char[hk] }} {{ v.label }}
          </td>
          <td>
            <select v-model="v.industry">
              <option v-for="n, k in gameStore.industries" :value="k">{{ n }}</option>
            </select>
          </td>
          <td><input type="number" class="w5em" v-model.number="v.manualWorkload"/></td>
          <td><input type="number" class="w5em" v-model.number="v.manualCycleIncome"/></td>
          <td><input type="number" class="float4" v-model.number="v.manualCp"/></td>
          <td>
            <div v-for="w in filteredWorkers.filter(w => w.job.hk == hk)">
              <button @click="this.$emit('editWorker', w)">edit</button>
              {{ userStore.workerLabel(w) }}
              @
              <template v-if="userStore.displayProfitPerCp">
                {{ formatFixed(userStore.workerIncomePerCp(w), 2) }} M$/day/CP
              </template>
              <template v-else>
                {{ formatFixed(userStore.workerIncome(w), 2) }} M$/day
              </template>
              <button @click="w.job = null">stop</button>
            </div>

            <div v-if="v.industry == 'mass'">
              <button @click="this.$emit('selectWorker', Number(hk))">add</button>
            </div>

            <div v-else-if="filteredWorkers.filter(w => w.job.hk == hk).length == 0">
              <button @click="this.$emit('selectWorker', Number(hk))">send</button>
            </div>
            
          </td>
        </tr>
      </template>

    </table>
  </details>
</template>



<style scoped>
summary {
  cursor: pointer;
}
</style>
