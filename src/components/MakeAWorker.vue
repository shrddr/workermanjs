<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {formatFixed} from '../util.js'

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()
    return { gameStore, userStore }
  },

  props: {
    pzk: Number,
    redirect: Number,
  },

  emits: [

  ],

  data: () => ({
    homeTnk: 1,
    workerKind: 'gob',
    selectedWorkerIndices: {},
    selectedWorkerPZSEs: {},
  }),

  methods: {
    formatFixed,

    workerStats(kind, tnk) {
      if (kind == 'gia') return this.gameStore.medianGiant(tnk)
      if (kind == 'hum') return this.gameStore.medianHuman(tnk)
      return this.gameStore.medianGoblin(tnk)
    },

    profitTownStats(tnk, stats) {
      const tk = this.gameStore._tnk2tk[tnk]
      const storageTk = this.redirect > 0 ? this.gameStore._tnk2tk[this.redirect] : tk
      const profitData = this.gameStore.profitPzTownStats(this.pzk, tnk, stats.wspd+5, stats.mspd, stats.luck, stats.isGiant)
      return profitData
    },

    assignWorker(PZSE) {
      const w = JSON.parse(JSON.stringify(PZSE.w))
      this.userStore.userWorkers.push(w)
      this.userStore.assignWorker(w, {kind: 'plantzone', pzk: PZSE.pz.key, storage: PZSE.tnk})
    },
  },

  computed: {

    workerKinds() {
      const ret = []
      for (const kind of ['gia', 'hum', 'gob']) {
        const t = {
          kind,
          stats: this.workerStats(kind, this.homeTnk),
        }
        t.profit = this.profitTownStats(this.homeTnk, t.stats)
        ret.push(t)
      }
      ret.sort((a,b)=>b.profit.priceDaily-a.profit.priceDaily)  // desc
      return ret
    },

    selectedWorkerStats() {
      return this.workerStats(this.workerKind, this.homeTnk)
    },

    nearestTowns() {
      const townsLimit = 5
      const townsData = []
      const tkCpList = this.gameStore.dijkstraNearestTowns(this.pzk, townsLimit, this.userStore.autotakenNodes)
      tkCpList.forEach(([tnk, mapCp, path]) => {
        const workerKinds = []

        for (const kind of ['gia', 'hum', 'gob']) {
          const stats = this.workerStats(kind, tnk)

          const tk = this.gameStore._tnk2tk[tnk]
          const w = {
            tk,
            tnk: this.gameStore.tk2tnk(tk),
            charkey: stats.charkey,
            label: this.userStore.newWorkerName(tk),
            level: stats.level,
            wspdSheet: stats.wspd,
            mspdSheet: stats.mspd,
            luckSheet: stats.luck,
            skills: [],
            job: null,
          }
          w.skills.push(1011)
          const storageTk = this.redirect > 0 ? this.gameStore._tnk2tk[this.redirect] : tk
          const statsOnPz = this.gameStore.workerStatsOnPlantzone(w)
          const PZSE = this.gameStore.pzSelectionEntry(this.pzk, tk, tnk, mapCp, path, w, statsOnPz, storageTk)
          if (PZSE.profit.dist > 1E6) return

          const t = {
            kind,
            stats,
            PZSE
          }
          workerKinds.push(t)
        }

        if (workerKinds.length == 0) return
        workerKinds.sort((a,b)=>b.PZSE.profit.priceDaily-a.PZSE.profit.priceDaily)  // desc
        this.selectedWorkerIndices[tnk] = 0
        
        townsData.push({
          tnk,
          workerKinds
        })
      })
      townsData.sort((a,b)=>b.workerKinds[0].PZSE.dailyPerCp-a.workerKinds[0].PZSE.dailyPerCp)  // desc
      return townsData
    },

  },
}

</script>

<template>
  <div>
    <h4>Nearest towns with hireable workers:</h4>
    {{ 1?'':workerKinds }}
    {{ 1?'':nearestTowns }}
    <table v-if="this.nearestTowns">
      <tr>
        <th>town</th>
        <th>walk</th>
        <th>make new level 40 artisan <abbr class="tooltip" title="with median stats and a single +5🔨 skill">ℹ️</abbr></th>
        <th>+CP <abbr class="tooltip" title="node connection + town housing = total">ℹ️</abbr></th>
        <th>M$/day/CP</th>
        <th>action</th>
      </tr>
      <tr v-for="nt in this.nearestTowns">
        <td>
          {{ gameStore.uloc.node[nt.tnk] }}
        </td>
        <td class="center">
          {{ formatFixed(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.profit.dist) }}
        </td>
        <td>
          <select v-model="selectedWorkerIndices[nt.tnk]">
            <option v-for="ksp, n in nt.workerKinds" :value="n">
              {{ gameStore.uloc.char[ksp.stats.charkey] }} ({{ formatFixed(ksp.PZSE.profit.priceDaily, 2) }} M$/day)
            </option>
          </select>
        </td>
        <td class="center">
          <abbr class="tooltip" :title="Array.from(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.path, nk => `${userStore.autotakenNodes.has(nk) ? 0 : gameStore.nodes[nk].CP} ${gameStore.uloc.node[nk]}`).join('\n')">
          {{ nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.mapCp }}
          </abbr>+<abbr class="tooltip" :title="nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.infraTooltip">{{ formatFixed(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.townCp) }}</abbr>={{ formatFixed(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.cp) }}
        </td>
        <td class="center">
          {{ formatFixed(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.dailyPerCp, 3) }}
        </td>
        <td>
          <button v-if="userStore.workedPlantzones.has(pzk.toString())" title="plantzone already occupied" disabled="true">hire+assign</button>
          <button v-else-if="isNaN(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.townCp)" title="Can't find housing, try P2W" disabled="true">hire+assign</button>
          <button v-else-if="isNaN(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE.profit.dist)" title="No walk path" disabled="true">hire+assign</button>
          <button v-else-if="gameStore.tnk2tk(nt.tnk) && gameStore.tnk2tk(nt.tnk) == 619 && !userStore.activateAncado" title="Ancado is not activated, can't house workers" disabled="true">hire+assign</button>
          <button v-else @click="assignWorker(nt.workerKinds[selectedWorkerIndices[nt.tnk]].PZSE)">
            hire+assign
          </button>
        </td>
      </tr>
      
    </table>
    <span v-else>
      None
    </span>
    
    
  </div>
</template>



<style scoped>
.tooltip {
  cursor: help;
}
</style>
