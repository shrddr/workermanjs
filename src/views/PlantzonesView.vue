<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import {makeIconSrc, formatFixed} from '../util.js'

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
  data: () => ({
    wspd: 150,
    mspd: 10,
    luck: 10,
    isGiant: false,
    mediahNodes: new Set([1210,1212,1215,1216,1219,1217,1213,1220,1205,1218]),  // these have routing overridden
    towns: [-1],
    filterTown: -1,
  }),
  methods: {
    makeIconSrc,
    formatFixed,

    formatDropQty(val) {
      if (val < 0.1) return formatFixed(val, 3)
      return formatFixed(val, 2)
    },

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

        const townLimit = this.mediahNodes.has(pzk) ? 3 : 2
        let towns = this.gameStore.dijkstraNearestTowns(pzk, townLimit)
        towns.sort((a,b) => a[1]-b[1])
        
        let workData = {}
        let alt_towns_dict = {}
        for (let i = 0; i < towns.length; i++) {
          const [tnk, cp] = towns[i]
          const tempData = this.gameStore.profitPzTownArtisans(pzk, tnk, cp)
          //if (pzk == 1635) console.log('allPlantzonesNearestCpTownProfit1635', tnk, tempData)
          if (tnk == 1343) continue // skip Ancado
          if (tempData.connected) {
            alt_towns_dict[tempData.tnk] = tempData.dailyPerCp
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
        const alt_towns = Object.entries(alt_towns_dict).map(([tnk, dailyPerCp]) => ({ tnk, dailyPerCp }))
        alt_towns.sort((a, b) => b.dailyPerCp - a.dailyPerCp) // without lodgage
        workData.alt_towns_dict = alt_towns_dict
        workData.alt_towns = alt_towns
        ret.push(workData)
      }
      console.log('cpt: plantzonesNearestCpTownProfit took', Date.now()-start, 'ms')
      return ret
    },

    allPlantzonesNearestCpTownProfit_sorted() {
      const ret = this.allPlantzonesNearestCpTownProfit.filter(workData => (this.filterTown == -1) || workData.tnk == this.filterTown)
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
      return this.gameStore.towns.map(tnk => tnk == 1343 ? -1 : tnk)
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
        at corresponding town (papu/dokkebi/etc), with only one skill - Farm Knowledge (+5🔨). 
        Home page has more tiers, levels, and skills.
      </p>
      <p>
        Note that CP costs shown here are independent for each node. In practice however,
        multiple resource nodes can reuse the same town connection, resulting in higher combined $/CP.
      </p>
      <p>
        For example, taking both Shakatu Fig nodes is not 3+3 but 3+1 CP. 
        Use worker management on Home page to take this (and also lodging/storage costs) into account.
      </p>
      <p>
        Don't forget to set up your server and prices on Settings page and maybe take a look at Modifiers as well.
        👺=goblin, 👨=human, 🐢=giant, hover for more info
      </p>
      Only show entries with best town = 
      <select v-model="filterTown">
        <option v-for="tnk in townsFilter" :value="tnk">{{ tnk>=0 ? gameStore.nodeName(tnk) : 'any'}}</option>
      </select>
    </div>

    <div class="scroll">
      <table>
        <tr>
          <th rowspan="2">Node</th>
          <th colspan="3">cycle drops</th>
          <th colspan="3">best town</th>
          <th colspan="2">best worker</th>
          <th rowspan="2">workload</th>
          <th colspan="3">daily</th>
          <th rowspan="2" v-if="userStore.workedPlantzones.size">
            <abbr class="tooltip nound" title="assigned on Home page?">🏠</abbr>
          </th>
        </tr>
        <tr>
          <!--Node-->
          <th>unlucky <span class="fss">[<input type="checkbox" v-model="isGiant"> with giant bonus]</span></th>
          <th>lucky</th>
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

        <tr v-for="e in allPlantzonesNearestCpTownProfit_sorted" :id="'drops'+e.key">
          <td>
            <RouterLink tag="a" :to="{path: './', hash: '#node' + e.key}">
              {{ gameStore.plantzoneName(e.key) }}
            </RouterLink>
          </td>
          <td>
            <div v-for="q, k in e.unlucky">
              <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
                <span>
                  {{ formatDropQty(q) }}
                  <img :src="makeIconSrc(k)" class="iconitem" />
                  {{ gameStore.uloc.item[k] }}
                </span>
              </RouterLink>
              <span class="fss" v-if="isGiant"> [{{ formatDropQty(e.unlucky_gi[k]) }}] </span>
            </div>
          </td>
          <td class="tac">
            <div v-for="q, k in e.lucky">
              <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
                {{ formatDropQty(q) }}&nbsp;<img :src="makeIconSrc(k)" class="iconitem" />
              </RouterLink>
            </div>
          </td>
          <td class="tac">{{ formatFixed(e.cycleValue, 0) }}</td>
          <td class="tac">
            <abbr class="tooltip nound" :title="e.alt_towns.map(obj => `${gameStore.nodeName(obj.tnk)}: ${formatFixed(obj.dailyPerCp, 2)} M$/day/CP → ${formatFixed(100*obj.dailyPerCp/e.dailyPerCp)}%`).join('\n')">{{ gameStore.nodeName(e.tnk) }}</abbr>
          </td>
          <td class="tac">{{ formatFixed(e.dist, 0) }}</td>
          <td class="tac">{{ e.cp }}</td>
          <td class="tac">
            <abbr class="tooltip nound" :title="e.alt_workers.map(obj => `${gameStore.uloc.char[obj.charkey]}: ${formatFixed(obj.priceDaily, 2)} M$/day → ${formatFixed(100*obj.priceDaily/e.priceDaily)}%`).join('\n')">{{ {'goblin':'👺','giant':'🐢', 'human':'👨'}[e.kind] }}</abbr>
          </td>
          <td class="tac">{{ formatFixed(e.wspd+5, 1) }}</td>
          <td class="tac">
            <template v-if="userStore.allowFloating && userStore.useFloatingModifiers[e.regiongroup]">
              ~{{ formatFixed(userStore.medianWorkloads[e.key], 2) }}
            </template>
            <template v-else>
              {{ formatFixed(e.activeWorkload, 2) }}
            </template>
          </td>
          <td class="tac">{{ formatFixed(e.cyclesDaily, 1) }}</td>
          <td class="tac">{{ formatFixed(e.priceDaily, 2) }}</td>
          <td class="tac">{{ formatFixed(e.dailyPerCp, 3) }}</td>
          <td class="tac" v-if="userStore.workedPlantzones.size">
            <template v-if="userStore.workedPlantzones.has(e.key.toString())">

              <template v-if="userStore.pzJobs[e.key].worker.tnk == e.tnk">
                <template v-if="userStore.pzJobs[e.key].worker.charkey == e.charkey">
                  <abbr class="tooltip nound" title="all good">✔️</abbr>
                </template>
                
                <template v-else>
                  <abbr class="tooltip nound" :title="`worker used: ${gameStore.uloc.char[userStore.pzJobs[e.key].worker.charkey]}\nsuggested: ${gameStore.uloc.char[e.charkey]}`+(userStore.pzJobs[e.key].worker.charkey in e.alt_workers_dict ? ` (${formatFixed(e.priceDaily / e.alt_workers_dict[userStore.pzJobs[e.key].worker.charkey] * 100 - 100)}% better)` : ``)">
                    <template v-if="(userStore.pzJobs[e.key].worker.charkey in e.alt_workers_dict && e.priceDaily / e.alt_workers_dict[userStore.pzJobs[e.key].worker.charkey] > 1.1)">
                      ⚠️
                    </template>
                    <template v-else>
                      ✔️
                    </template>
                  </abbr>
                  
                </template>
              </template>

              <template v-else>
                <abbr class="tooltip nound" :title="`town used: ${gameStore.nodeName(userStore.pzJobs[e.key].worker.tnk)}\nsuggested: ${gameStore.nodeName(e.tnk)}`+(userStore.pzJobs[e.key].worker.tnk in e.alt_towns_dict ? ` (${formatFixed(e.dailyPerCp / e.alt_towns_dict[userStore.pzJobs[e.key].worker.tnk] * 100 - 100)}% better)` : ``)">
                  ⚠️
                </abbr>
              </template>
              
            </template>
            <template v-else>
              <abbr class="tooltip nound" title="not assigned">❌</abbr>
            </template>
          </td>
        </tr>

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

.tar {
  text-align: right;
}
.tac {
  text-align: center;
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

.nound {
  text-decoration: none;
}

</style>
