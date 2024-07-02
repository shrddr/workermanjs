<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {makeIconSrc, formatFixed} from '../util.js'
import { ref } from 'vue';

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore }
  },

  props: {
    w: Object,
    defaultRedirect: Number,
    show: {
      type: Boolean,
      default: false
    }
  },

  data: () => ({
    customProfit: 0,
    customCP: 0,
    customLabel: '',
    selectedRedirect: 1,
  }),

  watch: { 
    show: function(newVal) {
      if (newVal) {
        this.selectedRedirect = this.w.tnk
      }
    },
  },

  methods: {
    makeIconSrc,
    formatFixed,
    assignWorkerPz(worker, pzk) {
      console.log('assigning to', this.selectedRedirect)
      this.userStore.assignWorker(worker, {kind: 'plantzone', pzk, storage: this.selectedRedirect})
      this.$emit('update:show', false)
    },
    assignWorkerFm(worker) {
      this.userStore.assignWorker(worker, 'farming')
      this.$emit('update:show', false)
    },
    assignWorkerCustom(worker) {
      this.userStore.assignWorker(worker, ['workshop', this.customProfit, this.customCP, this.customLabel])
      this.$emit('update:show', false)
    },
    assignWorkerWorkshop(worker, hk) {
      this.userStore.assignWorker(worker, {kind: 'workshop', hk, recipe: undefined})
      this.$emit('update:show', false)
    },
    workshopBusy(hk) {
      return this.userStore.userWorkers.some(w => w.job && w.job.kind == 'workshop' && w.job.hk == hk)
    },
  },

  computed: {
    thisFarmSelectionEntry() {
      return this.gameStore.farmSelectionEntry(this.gameStore.tnk2tk(this.w.tnk))
    },
    addBedHereInfo() {
      return this.gameStore.addBedInfo(this.gameStore.tnk2tk(this.w.tnk))
    },
    workerNearestCpPlantzonesProfit() {
      const ret = []
      if (!this.w) return ret
      const start = Date.now()
      const pzLimit = 16
      const statsOnPz = this.gameStore.workerStatsOnPlantzone(this.w)
      const lodgingTk = this.gameStore.tnk2tk(this.w.tnk)
      const storageTk = this.gameStore.tnk2tk(this.selectedRedirect)
      // more than needed to discard after sorting
      const pzList = this.gameStore.dijDiscountedNearestPlantzones(this.w.tnk, 80)
      //console.log('pzList', pzList)
      
      pzList.forEach(([pzk, mapCp, path]) => {
        if (this.userStore.workedPlantzones.has(pzk.toString())) {
          return
        }
        const entry = this.gameStore.pzSelectionEntry(pzk, lodgingTk, this.w.tnk, mapCp, path, this.w, statsOnPz, storageTk)
        if (entry.profit.dist > 1E6) {
          return
        }
        ret.push(entry)
      })
      ret.sort((a,b) => b.dailyPerCp-a.dailyPerCp)
      console.log('cpt: workerNearestCpPlantzonesProfit took', Date.now()-start, 'ms')
      //console.log(ret)
      return ret.slice(0, pzLimit)
    },
    workerWorkshopsProfit() {
      const ret = []
      if (!this.w) return ret
      const wtk = this.gameStore.tnk2tk(this.w.tnk)
      const start = Date.now()
      const maxEntries = 16
      const localTaken = new Set([...this.userStore.autotakenNodes])

      for (const [hks, workshop] of Object.entries(this.userStore.userWorkshops)) {
        const hk = Number(hks)
        if (this.workshopBusy(hk) && workshop.industry != 'mass') continue
        if (this.gameStore.houseDistance(this.w.tnk, hk) > 1E6) continue
        const houseTk = this.gameStore.houseInfo[hk].affTown
        const houseTnk = this.gameStore.tk2tnk(houseTk)
        const houseCp = this.userStore.occupiedWorkshops.has(Number(hk)) ? 0 : workshop.manualCp
        const [usedPath, usedPathCost] = this.gameStore.dijkstraPath(houseTnk, this.w.tnk, localTaken)
        const e = this.gameStore.workshopSelectionEntry(
          hk, wtk, this.w.tnk, usedPath, this.w, usedPathCost, houseCp
        )
        ret.push(e)
      }

      ret.sort((a,b) => b.dailyPerCp-a.dailyPerCp)
      console.log('cpt: workerWorkshopsProfit took', Date.now()-start, 'ms')
      console.log('workerWorkshopsProfit', ret)
      return ret.slice(0, maxEntries)
    },
  },
}
</script>

<template>
  <template v-if="w">
    <div class="spaced-columns">
      <div>
        Send {{ w.label }} 
        
        (
          <template v-if="userStore.displayWorkerStatsForPz">
            {{ formatFixed(gameStore.workerStatsOnPlantzone(w).wspd, 2) }}🔨
            {{ formatFixed(gameStore.workerStatsOnPlantzone(w).mspd, 2) }}🦶
            {{ formatFixed(gameStore.workerStatsOnPlantzone(w).luck, 2) }}🍀
          </template>
          <template v-else>
            {{ formatFixed(w.wspdSheet, 2) }}🔨
            {{ formatFixed(w.mspdSheet, 2) }}🦶
            {{ formatFixed(w.luckSheet, 2) }}🍀
          </template>
        )
        where? 
        {{ workerNearestCpPlantzonesProfit.length }} top untaken nodes 
        near {{ gameStore.uloc.node[w.tnk] }}:
      </div>
      <div>
        stash:
        <select v-model="selectedRedirect">
          <option v-for="tnk in gameStore.townSet" :value="tnk">
            {{ gameStore.uloc.node[tnk] }}
          </option>
        </select>
      </div>
    </div>

    <table>
      <tr>
        <th>node</th>
        <th>workload</th>
        <th>walk</th>
        <th>+M$/day</th>
        <th>+CP</th>
        <th>M$/day/CP</th>
        <th v-if="0">+efficiency</th>
        <th>action</th>
      </tr>

      <tr v-for="job in workerNearestCpPlantzonesProfit">
        <td>
          <a :href="this.userStore.codexNodeUrl+job.pz.key">
          {{ job.pz.name }}
          </a>
          <template v-for="k in this.gameStore.plantzones[job.pz.key].itemkeys">
            {{ ' ' }}
            <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
              <img :src="makeIconSrc(k)" class="iconitem">
            </RouterLink>
          </template>
        </td>
        
        <td class="tac">
          {{ userStore.useFloatingModifiers[job.pz.regiongroup] ? "~" : "" }}{{ formatFixed(userStore.medianWorkloads[job.pz.key], 2) }}
        </td>

        <td class="tac">
          {{ formatFixed(job.profit.dist, 0) }}
        </td>
        <td class="tac">
          {{ formatFixed(job.profit.priceDaily, 2) }}
        </td>
        <td class="tac">
          <abbr :title="Array.from(job.path, nk => `${userStore.autotakenNodes.has(nk) ? 0 : gameStore.nodes[nk].CP} ${gameStore.uloc.node[nk]}`).join('\n')" class="tooltip">
            {{ job.mapCp }}
          </abbr>+<abbr :title="job.infraTooltip" class="tooltip">{{ formatFixed(job.townCp) }}</abbr>={{ formatFixed(job.cp) }}
        </td>
        <td class="tac">
          {{ formatFixed(job.dailyPerCp, 2) }}
        </td>
        <td v-if="0" class="tac">
          {{ formatFixed(job.effDelta, 3, true) }}
        </td>
        <td>
          <button @click="assignWorkerPz(w, job.pz.key)">assign</button>
        </td>
      </tr>

      <tr><td colspan="7" class="center">Special jobs (not node based)</td></tr>

      <tr v-if="userStore.farmingEnable && userStore.workersFarmingCount < 10">
        <td>
          🌻 Farm <abbr title="see Settings page: singleWorkerProfit = (fullWorkersProfit - noWorkersProfit) / 10" class="tooltip">ℹ️</abbr>
        </td>
        <td class="tac">x</td>
        <td class="tac">x</td>
        <td class="tac">
          {{ formatFixed(thisFarmSelectionEntry.income, 2) }}
        </td>
        <td class="tac">
          <abbr :title="thisFarmSelectionEntry.infraTooltip" class="tooltip">
            {{ formatFixed(thisFarmSelectionEntry.infraCp) }}
          </abbr>
        </td>
        <td class="tac">
          {{ formatFixed(thisFarmSelectionEntry.dailyPerCp, 2) }}
        </td>
        <td v-if="0" class="tac">
          {{ formatFixed(thisFarmSelectionEntry.effDelta, 3, true) }}
        </td>
        <td>
          <button @click="assignWorkerFm(w)">assign</button>
        </td>
      </tr>

      <tr v-for="e in workerWorkshopsProfit">
        <td>
          🏭 
          {{ gameStore.uloc.char[e.hk] }}
          {{ e.workshop.label }}
        </td>
        <td class="tac">
          {{ e.workshop.manualWorkload }}
        </td>
        <td class="tac">
          {{ formatFixed(e.profit.distance, 0) }}
        </td>
        <td class="tac"> 
          {{ formatFixed(e.profit.priceDaily, 2) }}
        </td>
        <td class="tac">
          <abbr class="tooltip" :title="'connection cost:\n'+Array.from(e.path, nk => `${userStore.autotakenNodes.has(nk) ? 0 : gameStore.nodes[nk].CP} ${gameStore.uloc.node[nk]}`).join('\n')">
            {{ e.mapCp }}
          </abbr>+<abbr class="tooltip" title="cost of operating the workshop
(see Settings > 🏭Workshops)">
            {{ e.houseCp }}
          </abbr>+<abbr :title="e.infraTooltip" class="tooltip">
            {{ e.townCp }}
          </abbr>={{ e.cp }}
        </td>
        <td class="tac">
          {{ formatFixed(e.dailyPerCp, 2) }}
        </td>
        <td v-if="0" class="tac">
          {{ formatFixed(e.effDelta, 3, true) }}
        </td>
        <td>
          <button @click="assignWorkerWorkshop(w, e.hk)">assign</button>
        </td>
      </tr>

      <tr>
        <td>
          ✍️ Custom job
          <abbr title="enter daily profit and CP cost for this specific job. these are per worker - so for Mass Production, divide by worker count manually" class="tooltip">ℹ️</abbr>
          <div style="float: right;">
            &nbsp;label: <input v-model="customLabel" class="workshop-label-input"/>
          </div>
        </td>
        <td class="tac">x</td>
        <td class="tac">x</td>
        <td class="tac"> 
          <input type="number" class="float4" step="0.1" v-model.number="customProfit"/> 
        </td>
        <td class="tac">
          <input type="number" class="float3" v-model.number="customCP"/>+<abbr :title="addBedHereInfo.tooltip" class="tooltip">{{ addBedHereInfo.cost }}</abbr>={{ customCP+addBedHereInfo.cost }}
        </td>
        <td class="tac">
          {{ formatFixed(customProfit / (customCP+addBedHereInfo.cost), 2) }}
        </td>
        <td v-if="0" class="tac">
          {{ formatFixed(userStore.jobEfficiencyDelta(customProfit, customCP+addBedHereInfo.cost), 3, true) }}
        </td>
        <td>
          <button @click="assignWorkerCustom(w)">assign</button>
        </td>
      </tr>

    </table>

  </template>
</template>

<style scoped>
.tac {
  text-align: center;
}
.tooltip {
  cursor: help;
}

</style>