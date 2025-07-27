<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {useMarketStore} from '../stores/market'
import {makeIconSrc, formatFixed, strShortenLeft} from '../util.js'
import WorkerJobDescription from '../components/WorkerJobDescription.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()
    const marketStore = useMarketStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore, marketStore }
  },

  emits: [
    'panToPaPos',
  ],

  components: {
    WorkerJobDescription,
  },

  data: () => ({
    activeTab: 'daily',
    selectedRedirect: -1,
  }),

  methods: {
    makeIconSrc,
    formatFixed,
    strShortenLeft,
  },

  computed: {
    untakenPlantzonesNearestCpTownProfit() {
      const start = Date.now()
      const userStore = useUserStore()
      const gameStore = useGameStore()
      
      let worldList = []
      this.gameStore.townsWithLodging.forEach(tnk => {
        // more than needed, discard after sorting
        const townList = this.gameStore.dijDiscountedNearestPlantzones(tnk, 12)
        //if (tnk == 1) console.log(tnk, townList)
        worldList[tnk] = townList
      })

      //console.log('worldList', worldList)
      let ret = []
      for (const [tnk, townlist] of Object.entries(worldList)) {
        townlist.forEach(([pzk, mapCp, path]) => {
          //if (tnk == 1) console.log(tnk, pzk)
          //if (pzk == 136) console.log('best 136')
          if (this.userStore.workedPlantzones.has(pzk.toString())) return
          const workData = gameStore.profitPzTownArtisans(pzk, tnk, mapCp)
          if (!workData.connected) {
            return
          }
          workData.path = path
          const tk = gameStore.tnk2tk(tnk)

          const storageTk = this.selectedRedirect < 0 ? tk : gameStore.tnk2tk(this.selectedRedirect)  // 0 -> undefined -> search for best
          const itemKeys = this.selectedRedirect == -2 ? new Set() : gameStore.plantzones[pzk].itemkeys
          const addInfraInfo = userStore.townInfraAddCost(tk, 1, itemKeys, storageTk)
          workData.townCp = addInfraInfo.cost
          workData.townCpTooltip = addInfraInfo.tooltip
          workData.dailyPerCp = workData.priceDaily / (workData.cp + workData.townCp)
          //if (tnk == 1 && pzk == 136) console.log('best 136', addInfraInfo, workData.dailyPerCp)
          if (isNaN(workData.dailyPerCp)) return
          //workData.deltaEff = userStore.jobEfficiencyDelta(workData.priceDaily, workData.cp + workData.townCp)
          //if (isNaN(workData.deltaEff)) return
          ret.push(workData)
          
        })
      }
      ret.sort((a,b) => b.dailyPerCp-a.dailyPerCp)
      console.log('cpt: untakenPlantzonesNearestCpTownProfit took', Date.now()-start, 'ms')
      return ret
    },
  },
}
</script>

<template>
  <nav style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
    <span @click="activeTab = 'daily'" :class="{tab: 1, green: activeTab != 'daily'}">Daily Yields</span>
    <span @click="activeTab = 'worst'" :class="{tab: 1, green: activeTab != 'worst'}">Worst Taken</span>
    <span @click="activeTab = 'best'" :class="{tab: 1, green: activeTab != 'best'}">Best Untaken</span>
  </nav>

  <div v-if="activeTab == 'daily'">
    <table class="stickyhead">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>M$</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="count, ik in userStore.jobsTally">
          <td>
            <a :href="this.userStore.itemUrl+ik">
              <img :src="makeIconSrc(ik)" class="iconitem" :data-key="ik" />
              {{ gameStore.uloc.item[ik] }}
            </a>
          </td>
          <td class="right">
            {{ formatFixed(count, count < 1 ? 2 : (count < 10 ? 1 : 0)) }}
          </td>
          <td class="right">
            {{ formatFixed(this.marketStore.priceBunch({[ik]: count}) / 1E6, 2) }}
          </td> 
        </tr>
      </tbody>
    </table>

    Cycles total:<br/>
    🗺️plantzones: {{ formatFixed(userStore.cyclesTally.pz) }}<br/>
    <template v-if="userStore.cyclesTally.workshop > 0">
      🏭workshops: {{ formatFixed(userStore.cyclesTally.workshop) }}<br/>
    </template>
    🌻farming: <abbr class="tooltip" title="no idea, depends on weather">0</abbr><br/>
    = {{ formatFixed(userStore.cyclesTally.chicken) }} chicken/day
  </div>


  <table class="stickyhead" v-if="activeTab == 'worst'">
    <thead>
      <tr>
        <th rowspan="2">town</th>
        <th rowspan="2">job</th>
        <th rowspan="2">M$/day</th>
        <th colspan="2">CP</th>
        <th rowspan="2">M$/day/CP</th>
      </tr>
      <tr>
        <th class="rowspanned colspanned">
          &nbsp;job <abbr class="tooltip" title="cost of the node (for plantzones) OR cost of the house (for workshops)">ℹ</abbr>
        </th>
        <th class="colspanned">
          town <abbr class="tooltip" title="worker lodging + material storage">ℹ</abbr>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="{w, i, ipc} in userStore.workersSortedByIncomePerCp">
        <td>
          <span @click="$emit('panToPaPos', this.gameStore.nodes[w.tnk].pos, -7)" class="clickable">
            {{ gameStore.uloc.town[gameStore.tnk2tk(w.tnk)] }}
          </span>
        </td>
        <td class="">
          <div class="hlim parent">
            <template v-if="this.gameStore.jobIsPz(w.job)">
              <span class="hlim left clickable" @click="$emit('panToPaPos', this.gameStore.nodes[w.job.pzk].pos)">
                {{ gameStore.parentNodeName(w.job.pzk) }}
              </span>
              <span class="hlim right">
                <template v-for="k in gameStore.plantzones[w.job.pzk].itemkeys">
                  <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
                    <img :src="makeIconSrc(k)" class="iconitem" />
                  </RouterLink>
                </template>
              </span>
            </template>
            <span v-else class="hlim left">
              <WorkerJobDescription :w="w"/>
            </span>
          </div>
        </td>
        <td class="tac">{{ formatFixed(i, 2) }}</td>
        <td class="tac">{{ formatFixed(userStore.workerSharedConnectionCP(w), 2) }}</td>
        <td class="tac">{{ formatFixed(userStore.workerSharedLodgageCP(w).value, 2) }}</td>
        <td class="tac">{{ formatFixed(ipc, 2) }}</td>
      </tr>
    </tbody>
  </table>

  <template v-if="activeTab == 'best'">
    <span class="fsxs">
      Compares 12 nearest (by CP) untaken nodes of each town. 
      Uses stats of median 40lvl artisans. 
      Stash at:
      <select v-model="selectedRedirect" class="fsxs">
        <option value="-2">ignore storage cost</option>
        <option value="-1">worker hometown</option>
        <option value="0">cheapest storage 🧊</option>
        <option v-for="tnk in gameStore.townsWithRedirectableStorage" :value="tnk">
          {{ gameStore.uloc.node[tnk] }}
        </option>
      </select>
    </span>

    <table class="stickyhead">
      <thead>
        <tr>
          <th>🛏️town</th>
          <th>job</th>
          <th>worker</th>
          <th>+M$/day</th>
          <th>+CP</th>
          <th>M$/day/CP</th>
          <th v-if="0">+efficiency</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="j in untakenPlantzonesNearestCpTownProfit">
          <td>
            <span @click="$emit('panToPaPos', this.gameStore.nodes[j.tnk].pos)" class="clickable">
              {{ gameStore.nodeName(j.tnk) }}
            </span>
            
          </td>
          <td>
            <div class="hlim parent">
              <span @click="$emit('panToPaPos', this.gameStore.nodes[j.key].pos)" class="hlim left clickable">
                {{ gameStore.parentNodeName(j.key) }}
              </span>
              <span class="hlim right">
                <template v-for="k in j.itemkeys">
                  <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
                    <img :src="makeIconSrc(k)" class="iconitem" />
                  </RouterLink>
                </template>
              </span>
            </div>
            
          </td>
          <td class="tac">
            <abbr v-if="j.alt_workers" class="tooltip nound" :title="j.alt_workers.map(obj => `${gameStore.uloc.char[obj.charkey]}: ${formatFixed(obj.priceDaily, 2)} M$/day = ${formatFixed(100*obj.priceDaily/j.priceDaily)}%`).join('\n')">{{ {'goblin':'👺','giant':'🐢', 'human':'👨'}[j.kind] }}</abbr>
          </td>
          <td class="tac">
            {{ formatFixed(j.priceDaily, 2) }}
          </td>
          <td class="tac">
            <abbr :title="Array.from(j.path, nk => `${userStore.autotakenNodes.has(nk) ? 0 : gameStore.nodes[nk].CP} ${gameStore.uloc.node[nk]}`).join('\n')" class="tooltip">
              {{ formatFixed(j.cp) }}
            </abbr>+<abbr :title="j.townCpTooltip" class="tooltip">{{ formatFixed(j.townCp) }}</abbr>={{ formatFixed(j.cp + j.townCp) }}
          </td>
          <td class="tac">
            {{ formatFixed(j.dailyPerCp, 2) }}
          </td>
          <td v-if="0" class="tac">
            {{ formatFixed(j.deltaEff, 3, true) }}
          </td>
        </tr>
      </tbody>
    </table>
  </template>

</template>

<style scoped>
div.limited {
  max-height: 50vh;
}

header {
  line-height: 1.5;
  max-height: 100vh;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-bottom: 1rem;
}
nav span {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
  cursor: pointer;
}

nav span:first-of-type {
  border: 0;
}

nav span.green:hover {
  background-color: hsla(160, 100%, 37%, 0.2);
}

.reducible {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 11em;
}

.hlim.parent {
  display: flex;
  max-width: 20em;
}

.hlim.left {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}

.hlim.right {
  flex: 0 0 auto;
}

.tar {
  text-align: right;
}
.tac {
  text-align: center;
}

.tooltip {
  cursor: help;
}

.nound {
  text-decoration: none;
}

</style>