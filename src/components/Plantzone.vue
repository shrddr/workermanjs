<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {formatFixed,makeIconSrc} from '../util.js'

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
    pzk: Number,
  },

  emits: [
    'showModifierDialog',
    'editWorker',
  ],

  components: {

  },

  data: () => ({
    selectedRedirect: 0,
  }),

  methods: {
    formatFixed,
    makeIconSrc,

    plantzoneNearestTownsFreeWorkersProfits(pzk, townsLimit) {
      const townsData = []
      const tkCpList = this.gameStore.dijkstraNearestTowns(pzk, townsLimit, this.userStore.autotakenNodes)
      tkCpList.forEach(([tnk, mapCp, path]) => {
        const tk = this.gameStore._tnk2tk[tnk]
        const freeWorkers = this.userStore.getFreeWorkers(tk)
        
        const storageTk = this.selectedRedirect > 0 ? this.gameStore._tnk2tk[this.selectedRedirect] : tk
        freeWorkers.forEach(w => {
          const stats = this.gameStore.workerStatsOnPlantzone(w)
          townsData.push(this.gameStore.pzSelectionEntry(pzk, tk, tnk, mapCp, path, w, stats, storageTk))
        })
      })
      townsData.sort((a,b)=>b.dailyPerCp-a.dailyPerCp)  // desc
      return townsData
    },
  },

  computed: {
    freeWorkers() {
      const arr = this.plantzoneNearestTownsFreeWorkersProfits(this.pzk, 99)
      const filtered = arr.filter((item, index, self) => {
        return index === self.findIndex(
          needle => needle.tnk === item.tnk && JSON.stringify(needle.statsOnPz) === JSON.stringify(item.statsOnPz)
        )
      })
      return filtered
    },
  },
}

</script>

<template>
  <div>
    <RouterLink tag="a" :to="{path: './plantzones', hash: '#drops' + pzk}">
      {{ gameStore.plantzoneName(pzk) }} 
    </RouterLink>
    
    {{ this.gameStore.nodes[pzk].CP }}CP

    <span v-if="pzk in this.gameStore.plantzones">
      <RouterLink v-for="k in this.gameStore.plantzones[pzk].itemkeys" tag="a" :to="{path: './settings', hash: '#item' + k}">
        <img :src="makeIconSrc(k)" class="iconitem">
      </RouterLink>
      
      [🍀{{ formatFixed(this.gameStore.plantzones[pzk].lucky ? this.gameStore.plantzones[pzk].luckyValue / this.gameStore.plantzones[pzk].unluckyValue : 1, 2) }}x]
    </span>
  </div>

  <div>
    workload:
    <template v-if="gameStore.ready && gameStore.plantzones[pzk].regiongroup && userStore.allowFloating && userStore.useFloatingModifiers[gameStore.plantzones[pzk].regiongroup]">
      ~{{ formatFixed(userStore.medianWorkloads[pzk], 2) }}
      <button @click="$emit('showModifierDialog', pzk)">review</button><!--📝-->
    </template>
    <template v-else>
      {{ formatFixed(gameStore.plantzones[pzk].activeWorkload, 2) }}
      ← modifier <input type="number" v-model.number="userStore.regionModifiers[gameStore.plantzones[pzk].regiongroup]" min="0" max="100" step="0.1" class="w42em" />
    </template>
  </div>

  <div id="plantzoneWorkerInfo">
    <template v-if="userStore.workedPlantzones.has(pzk.toString())">
      worker: 
      {{ userStore.pzJobs[pzk].worker.label }}
      @
      {{ formatFixed(userStore.pzJobs[pzk].profit.priceDaily, 3) }} M$/day
      <template v-if="userStore.workedPlantzones.has(pzk.toString())">
        <button @click="$emit('editWorker', userStore.pzJobs[pzk].worker)">
          edit
        </button>
        <button @click="userStore.pzJobs[pzk].worker.job = null">
          stop
        </button>
      </template>

      <br/>
      connection cost: 
      {{ formatFixed(userStore.pzjobsSharedConnectionCP[pzk].value, 3) }} CP 
      <abbr class="tooltip" :title="'full cost of this node + Σ of connection nodes costs shared proportionally between all active jobs using them\n'+userStore.pzjobsSharedConnectionCP[pzk].tooltip">ℹ️</abbr>
      <br/>
      lodgage cost: 
      {{ formatFixed(userStore.workerSharedLodgageCP(userStore.pzJobs[pzk].worker).value, 3) }} CP 
      <abbr class="tooltip" :title="userStore.workerSharedLodgageCP(userStore.pzJobs[pzk].worker).tooltip">ℹ️</abbr>
      <br/>
      efficiency: {{ formatFixed(userStore.workerIncomePerCp(userStore.pzJobs[pzk].worker), 3) }} M$/day/CP
      <abbr class="tooltip" title="income / (connectionCost + lodgageCost)">ℹ️</abbr>

    </template>

    <template v-else>
      worker: none
    </template>
  </div>


  <div>
    <div class="spaced-columns">
      <div>Nearest towns with idle workers: 
        <template v-if="freeWorkers.length == 0">
          None
        </template>
      </div>
      <div v-if="freeWorkers.length && !userStore.workedPlantzones.has(pzk.toString())" style="margin-right: 6px;">stash:
        <select v-model="selectedRedirect">
          <option value="0">worker hometown</option>
          <option v-for="tnk in gameStore.townWithHousingSet" :value="tnk">
            {{ gameStore.uloc.node[tnk] }}
          </option>
        </select>
      </div>
    </div>
    
    <template v-if="freeWorkers.length">
      <table>
        <tr>
          <th>town</th>
          <th>walk</th>
          <th>worker <abbr title="same town&stat workers are hidden in this view">ℹ️</abbr></th>
          <th>+M$/day</th>
          <th>+CP</th>
          <th>M$/day/CP</th>
          <th>action</th>
        </tr>
        <template v-for="e in freeWorkers">
          <tr v-if="e.profit.dist < 1E6">
            <td>{{ gameStore.nodeName(e.tnk) }}</td>
            <td>{{ formatFixed(e.profit.dist) }}</td>
            <td>
              {{ e.w.label }}
              <span class="fsxs">
                {{ formatFixed(e.statsOnPz.wspd, 2) }}🔨
                {{ formatFixed(e.statsOnPz.mspd, 2) }}🦶
                {{ formatFixed(e.statsOnPz.luck, 2) }}🍀
              </span>
            </td>
            <td class="center">
              {{ formatFixed(e.profit.priceDaily, 2) }}
            </td>
            <td>
              <abbr class="tooltip" :title="Array.from(e.path, nk => `${userStore.autotakenNodes.has(nk) ? 0 : gameStore.nodes[nk].CP} ${gameStore.uloc.node[nk]}`).join('\n')">
              {{ e.mapCp }}
              </abbr>+<abbr class="tooltip" :title="e.infraTooltip">{{ e.townCp }}</abbr>={{ e.cp }}
            </td>
            <td class="center">
              {{ formatFixed(e.dailyPerCp, 3) }}
            </td>
            <td>
              <button v-if="userStore.workedPlantzones.has(pzk.toString())" title="plantzone already occupied" disabled="true">assign</button>
              <button v-else-if="gameStore.tnk2tk(e.w.tnk) && gameStore.tnk2tk(e.w.tnk) == 619 && !userStore.activateAncado" title="Ancado is not activated, can't house workers" disabled="true">assign</button>
              <button v-else @click="userStore.assignWorker(e.w, {kind: 'plantzone', pzk: e.pz.key, storage: e.tnk})">
                assign
              </button>
            </td>
          </tr>
        </template>
      </table>
    </template>
    

  </div>

  <template v-if="0">
    <details>
      <summary>Same town workers performance</summary>
      <p>
        <table>
          <tr>
            <th>w</th>
            <th>a</th>
          </tr>
          <tr>
            <td>1</td>
            <td>2</td>
          </tr>
        </table>
      </p>
    </details>
  </template>

</template>



<style scoped>
.townbox {
  margin-top: 0.8em;
}
.unresolved {
  background-color: rgba(255, 0, 0, 0.2);
}
.tooltip {
  cursor: help;
}
</style>
