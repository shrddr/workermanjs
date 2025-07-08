<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import {makeIconSrc, formatFixed} from '../util.js'
import PlantzonesRow from '../components/PlantzonesRow.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()
    const marketStore = useMarketStore()
    const mapStore = useMapStore()

    mapStore.$subscribe((mutation, state) => {
      localStorage.setItem('map', JSON.stringify(state))
    })

    userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })

    return { marketStore, userStore, gameStore, mapStore }
  },
  

  components: {
    PlantzonesRow,
  },

  data: () => ({
    wspd: 150,
    mspd: 10,
    luck: 10,
    showGiantValues: false,
    mediahNodes: new Set([1210,1212,1215,1216,1219,1217,1213,1220,1205,1218]),  // these have routing overridden
    towns: [-1],
    filterTown: -1,
    hideTaken: false,
  }),
  methods: {
    makeIconSrc,
    formatFixed,

    highlightHash() {
      if (this.$route.hash) {
        const el = document.querySelector(this.$route.hash)
        if (el) {
          el.scrollIntoView()
          el.classList.add("anim")
        }
      }
    },

    setMedianChar(charkey) {
      if (!charkey) return
      const stat = this.gameStore.workerStatic[charkey]
      let pa_wspd = stat.wspd
      let pa_mspdBonus = 0
      let pa_luck = stat.luck
      for (let i = 2; i <= 40; i++) {
        pa_wspd += (stat.wspd_lo + stat.wspd_hi) / 2
        pa_mspdBonus += (stat.mspd_lo + stat.mspd_hi) / 2
        pa_luck += (stat.luck_lo + stat.luck_hi) / 2
      }

      let pa_mspd = stat.mspd * (1 + pa_mspdBonus / 1E6)

      this.wspd = Math.round(pa_wspd / 1E6 * 100) / 100
      this.mspd = Math.round(pa_mspd) / 100
      this.luck = Math.round(pa_luck / 1E4 * 100) / 100
      this.isGiant = this.gameStore.isGiant(charkey)
    },
  },

  computed: {

    allPlantzonesNearestCpTownProfit() {
      const start = Date.now()
      const ret = []
      for (const pzd of Object.values(this.gameStore.plantzones)) {
        const pzk = pzd.key

        // some mediah nodes need deeper search to prevent suggesting Iliya
        const townLimit = this.mediahNodes.has(pzk) ? 3 : 2
        let towns = this.gameStore.dijkstraNearestTowns(pzk, townLimit, undefined, true, undefined, true)
        towns.sort((a,b) => a[1]-b[1])
        //if (pzk == 1046) console.log(`allPlantzonesNearestCpTownProfit pzk=${pzk} towns:`, towns)
        
        let workData = {}
        let alt_towns_profits = {}
        for (let i = 0; i < towns.length; i++) {
          const [tnk, cp] = towns[i]
          const tempData = this.gameStore.profitPzTownArtisans(pzk, tnk, cp)
          //if (pzk == 1046) console.log(`allPlantzonesNearestCpTownProfit pzk=${pzk}`, tnk, tempData)
          if (tnk == 1343) continue // skip Ancado
          if (tempData.connected) {
            alt_towns_profits[tempData.tnk] = tempData.dailyPerCp
            if (!('priceDaily' in workData)) {
              workData = tempData
              continue
            }
            if (tempData.dailyPerCp > workData.dailyPerCp) {
              workData = tempData
            }
          }
        }
        if (!('alt_workers' in workData)) throw new Error(`Failed to calc alt_workers for pzk=${pzk}`)
        const alt_towns = Object.entries(alt_towns_profits).map(([tnk, dailyPerCp]) => ({ tnk, dailyPerCp }))
        alt_towns.sort((a, b) => b.dailyPerCp - a.dailyPerCp) // without lodgage
        workData.alt_towns_profits = alt_towns_profits
        workData.alt_towns = alt_towns
        ret.push(workData)
      }
      console.log('cpt: plantzonesNearestCpTownProfit took', Date.now()-start, 'ms')
      return ret
    },

    allPlantzonesNearestCpTownProfit_sorted() {
      const ret = this.allPlantzonesNearestCpTownProfit.filter(e => {
        if ((this.filterTown != -1) && e.tnk != this.filterTown) return false
        if (this.hideTaken && this.userStore.workedPlantzones.has(e.key.toString())) return false
        return true
      })
      ret.sort((a,b) => {
        if(isFinite(b.dailyPerCp-a.dailyPerCp)) { // desc
          return b.dailyPerCp-a.dailyPerCp; 
        } else {
          return isFinite(a.dailyPerCp) ? -1 : 1;
        }
      })
      return ret
    },
    
    townsFilter() {
      return this.gameStore.townsWithLodging.map(tnk => tnk == 1343 ? -1 : tnk)
    }
  },

  mounted() {
    this.highlightHash()
  },
  updated() {
    this.$nextTick(() => this.highlightHash())
  }
}
</script>

<template>
  <main>
    <div id="toptext">
      <p>
        Profits here are calculated using average level 40 stats for artisan workers 
        at corresponding town (papu/dokkebi/etc), with only one skill (+5🔨). 
        Home page has more tiers, levels, and skills.
      </p>
      <p>
        Note that CP costs shown here are independent for each node. In practice however,
        multiple resource nodes can reuse the same town connection, resulting in higher combined $/CP.
      </p>
      <p>
        For example, taking both Shakatu Fig nodes should not be 3+3 but 3+1 CP. 
        Use Home page instead of Plantzones to take into account connection reuse (and also lodging/storage costs).
      </p>
      <p>
        Don't forget to set up your server and prices on Settings page and maybe take a look at Resources as well.
        👺=goblin, 👨=human, 🐢=giant, hover for more info
      </p>
      Only show entries with best town = 
      <select v-model="filterTown">
        <option v-for="tnk in townsFilter" :value="tnk">{{ tnk>=0 ? gameStore.nodeName(tnk) : 'any'}}</option>
      </select>
      hide taken <input type="checkbox" v-model="hideTaken">
    </div>

    <div class="scroll">
      <table>
        <tr>
          <th rowspan="2">Node</th>
          <th colspan="3">cycle drops <span class="fss">[<input type="checkbox" v-model="showGiantValues"> as giant]</span></th>
          <th colspan="3">best town</th>
          <th colspan="2">best worker</th>
          <th rowspan="2">workload</th>
          <th colspan="3">daily</th>
          <th rowspan="2" v-if="userStore.workedPlantzones.size">
            <abbr class="tooltip nound" title="assigned on Home page?
(hover for details)
'X% better' does not consider:
- worker stats
- worker skills
- connection reuse
- lodging and storage">🏠</abbr>
          </th>
        </tr>
        <tr>
          <!--Node-->
          <th>unlucky</th>
          <th>
            lucky
            <abbr title="you always get unlucky items;
these are ADDITIONAL, with
chance equal to luck stat" class="tooltip">ℹ</abbr>
          </th>
          <th>$ value</th>
          <th>name</th>
          <th>walk</th>
          <th>CP</th>
          <th>type</th>
          <th>wspd</th>
          <th>cycles</th>
          <th>M$</th>
          <th>M$/CP</th>
          <!--taken-->
        </tr>

        
        <PlantzonesRow 
          v-for="e in allPlantzonesNearestCpTownProfit_sorted" :id="'drops'+e.key"
          :e="e"
          :showGiantValues="showGiantValues"
        />

      </table>
    </div>

  </main>
</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.scroll {
  overflow: auto;
}
.inside {
  font-size: 5px;
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: -2;
}


.anim {
  background-color: var(--color-background);
  animation-name: highlight;
  animation-duration: 2s;
}

@keyframes highlight {
  0%   {background-color:var(--color-background); }
  50%  {background-color:hsla(160, 100%, 37%, 0.3); }
  100% {background-color:var(--color-background); }
}
.tooltip {
  cursor: help;
}

</style>
