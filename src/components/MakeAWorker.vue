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
      const profitData = this.gameStore.profitPzTownStats(this.pzk, tnk, stats.wspd+5, stats.mspd, stats.luck, stats.isGiant)
      return profitData
    },

    assignWorker(PZSE) {
      if (!PZSE.storageTnk) throw Error('no storage')
      const w = JSON.parse(JSON.stringify(PZSE.w))
      this.userStore.userWorkers.push(w)
      this.userStore.assignWorker(w, {kind: 'plantzone', pzk: PZSE.pz.key, storage: PZSE.storageTnk})
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
      const lodgingTnkList = this.gameStore.dijkstraNearestTowns(this.pzk, townsLimit, this.userStore.autotakenNodes, true)
      lodgingTnkList.forEach(([lodgingTnk, mapCp, path]) => {
        const workerKinds = []

        const lodgingTk = this.gameStore._tnk2tk[lodgingTnk]
        const storageTk = this.redirect == -1 ? lodgingTk : this.gameStore.tnk2tk(this.redirect)  // sets to undefined if not found
        const addInfraInfo = this.userStore.townInfraAddCost(lodgingTk, 1, this.gameStore.plantzones[this.pzk].itemkeys, storageTk)
        //console.log(`nearestTowns::addInfraInfo(${lodgingTnk}, ${storageTk}) = `, addInfraInfo)

        for (const kind of ['gia', 'hum', 'gob']) {
          const stats = this.workerStats(kind, lodgingTnk)

          const w = {
            tk: lodgingTk,
            tnk: lodgingTnk,
            charkey: stats.charkey,
            label: this.userStore.newWorkerName(lodgingTk),
            level: stats.level,
            wspdSheet: stats.wspd,
            mspdSheet: stats.mspd,
            luckSheet: stats.luck,
            skills: [],
            job: null,
          }
          w.skills.push(1011)
          
          const statsOnPz = this.gameStore.workerStatsOnPlantzone(w)

          //const PZSE = this.gameStore.pzSelectionEntry(this.pzk, lodgingTk, lodgingTnk, mapCp, path, w, statsOnPz, storageTk)

          const profitData = this.gameStore.profitPzTownStats(this.pzk, lodgingTnk, statsOnPz.wspd, statsOnPz.mspd, statsOnPz.luck, this.gameStore.isGiant(w.charkey))
          if (profitData.dist > 1E6) return
          const PZSE = {
            pz: this.gameStore.plantzones[this.pzk],
            tnk: lodgingTnk,
            mapCp, 
            path,
            townCp: addInfraInfo.cost,
            infraTooltip: addInfraInfo.tooltip,
            cp: mapCp + addInfraInfo.cost,
            profit: profitData,
            w,
            statsOnPz,
            storageTnk: this.gameStore.tk2tnk(addInfraInfo.storageTk),
          }
          PZSE.dailyPerCp = PZSE.profit.priceDaily / (mapCp + addInfraInfo.cost)
          PZSE.effDelta = this.userStore.jobEfficiencyDelta(PZSE.profit.priceDaily, mapCp + addInfraInfo.cost)

          const t = {
            kind,
            stats,
            PZSE
          }
          workerKinds.push(t)
        }

        if (workerKinds.length == 0) return
        workerKinds.sort((a,b)=>b.PZSE.profit.priceDaily-a.PZSE.profit.priceDaily)  // desc
        this.selectedWorkerIndices[lodgingTnk] = 0
        
        townsData.push({
          tnk: lodgingTnk,
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
    
    <table v-if="this.nearestTowns">
      <tr>
        <th>🛏️town</th>
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
