<script>
import {useUserStore} from '../stores/user.js'
import {useRoutingStore} from '../stores/routing.js'
import {useGameStore} from '../stores/game.js'
import {useMarketStore} from '../stores/market'
import {formatFixed, hoursToHMS} from '../util.js'
import ItemIcon from '../components/lo/ItemIcon.vue'
import PriceInput from './lo/PriceInputAbbrHeld.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const routingStore = useRoutingStore()
    const gameStore = useGameStore()
    const marketStore = useMarketStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore, routingStore, marketStore }
  },

  props: {
    show: {
      type: Boolean,
      default: false
    }
  },

  components: {
    ItemIcon,
    PriceInput,
  },

  created() {
    // this.fetchData()
  },

  data: () => ({
    
    repeatGroupMeanings: {
      '0': 'wspd',
      '1': 'wspd_jewelry',
      '2': 'wspd_mass',
      '3': 'wspd_weap',
      '4': 'wspd_tool',
      '5': 'wspd_furn',
      '7': 'wspd_costume',
      '8': 'wspd_refine',
      '9': 'wspd_siege',
      '10': 'wspd_mount',
      '11': 'wspd_farm',
      '13': 'wspd_exclus',
    },
  }),

  computed: {
    repeatGroupIds() {
      const ret = {}
      for (const [i, s] of Object.entries(this.repeatGroupMeanings)) {
        ret[s] = Number(i)
      }
      return ret
    },

    usedInputItems() {
      const ret = new Set([9492])
      if (!this.gameStore.ready) return ret
      for (const rcps of Object.values(this.userStore.perTownPerRecipePerThrifty)) {
        for (const rcp of Object.keys(rcps)) {
          const inputs = this.gameStore.craftInputs[rcp]
          for (const ik of Object.keys(inputs)) {
            ret.add(ik)
          }
        }
      }
      return ret
    },

    tradingLevelString() {
      const i = this.userStore.tradingLevel
      if (90 < i) return `G${i - 90}`
      if (60 < i) return `M${i - 60}`
      return `${i}`
    },

  },

  methods: {
    formatFixed,
    hoursToHMS,
    
    routeSortedDestinations(rcp, origin) {
      const ret = []
      for (const destination of Object.keys(this.gameStore.traders)) {
        ret.push(this.tradeInfo(rcp, origin, destination))
      }
      ret.sort((a,b) => (b.sellPrice-b.transportFee)-(a.sellPrice-a.transportFee))  // TODO: connection cost
      return ret
    },

    townSortedDestinations(origin) {
      const ret = []
      const rcp = 9212  // TODO: depends on what is actually being produced
      for (const destination of Object.keys(this.gameStore.traders)) {
        ret.push(this.gameStore.tradeInfo(rcp, origin, destination))
      }
      ret.sort((a,b) => (b.sellPrice-b.transportFee)-(a.sellPrice-a.transportFee))  // TODO: connection cost
      return ret
    },
    
    copyToWorkshops() {
      for (const wsj of this.routingStore.wsJobs) {
        const origin = wsj.worker.tnk
        const rcp = wsj.worker.job.recipe
        const thriftyPercent = wsj.thriftyPercent
        const hk = wsj.worker.job.hk
        const workshop = this.userStore.userWorkshops[hk]
        
        if (origin in this.userStore.tradingTable.towns) {
          for (const row of this.userStore.tradingTable.towns[origin]) {
            if (rcp == row.rcp && thriftyPercent == row.thriftyPercent) {
              //console.log(wsj.worker.label, workshop, row)
              workshop.industry = row.perf.repeatGroup
              workshop.manualWorkload = row.perf.workload
              workshop.manualCp = row.tradeInfo.cp / row.perf.workers
              workshop.manualCycleIncome = Math.round(row.tradeInfo.delta)
            }
          }
        }
      }
    },

  },

}
</script>



<template>
  <div class="container">

    <!--
    M$/CP/day: <input type="number" class="w3em" step="0.01" v-model.number="cpCost">
    -->
    
  </div>
  
  <div class="container">
    <div class="left">

      <h3 style="display: inline">Active recipes</h3>
      
      <table>
        <thead>
          <tr>
            <th>out</th>
            <th>sell $</th>
            <th>
              <abbr class="tooltip" title="workers">
                w
              </abbr>
            </th>
            <th>
              <abbr class="tooltip" title="crates/day">
                c/d
              </abbr>
            </th>
            <th>
              <abbr class="tooltip" title="thrifty% (x = not applicable)">
                🧪
              </abbr>
            </th>
            <th>make $</th>
            <th>wagon $</th>
            <th>profit $</th>
            <th>
              ROI
              <abbr class="tooltip" title="make $ / profit $">ℹ</abbr>
            </th>
            <th>M$/day</th>
            <th>
              CP
              <abbr class="tooltip" title="infra + connection">ℹ</abbr>
            </th>
            <th>M$/day/CP</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="rows, origin in userStore.tradingTable.towns">
            <tr>
              <td colspan="2" class="tac">
                {{ gameStore.uloc.node[origin] }}
              </td>
              <td colspan="4" class="tac">
                <abbr class="tooltip" title="total town infrastructure 
(workshops, storage, house connections)
ON TOP of the houses autoassigned 
on Home page (lodging is autoassigned)">infra</abbr>{{  }}
                <input type="number" class="w33em" v-model.number="userStore.tradeInfraCp[origin]">
                CP
              </td>
              <td colspan="6">
                <select v-model="userStore.tradeDestinations[origin]">
                  <option v-for="e in townSortedDestinations(origin)" :key="e.destination" :value="e.destination">
                    {{ gameStore.uloc.node[e.destination] }}
                    {{ formatFixed(e.distanceBonus*100, 2) }}%
                    {{ formatFixed(e.wagonFee/1000) }}k$
                  </option>
                </select>
                <button @click="delete userStore.tradeDestinations[origin]">x</button>
                
                <abbr v-if="routingStore.wagonCpCosts[origin]" :title="routingStore.wagonCpCosts[origin].tooltip" class="tooltip">
                  {{ formatFixed(routingStore.wagonCpCosts[origin].value, 1, false, true) }}
                </abbr>

                <template v-if="userStore.townStat[origin].reverseConnection == false">
                  cost
                  <!--<input 
                    v-model.number="userStore.tradeRouteCp[origin]"
                    type="number" 
                    class="w3em">
                  CP-->
                  
                  <span class="spacer"></span>
                  <input type="checkbox" v-model="userStore.tradeRouteOn[origin]"> on
                  <input type="checkbox" v-model="userStore.tradeRouteAlwaysOn[origin]"> always
                </template>
                <template v-else>(reusing)</template>
              </td>
            </tr>

            <tr v-for="row in rows" :key="row.tnk + '/' + row.rcp">
              <td v-if="!row.collapsed" :rowspan="row.rowspan">
                <template v-if="row.rcp && gameStore.craftOutputs[row.rcp]">
                  <template v-for="ik in gameStore.craftOutputs[row.rcp]">
                    <template v-if="gameStore.craftInfo[row.rcp].aoc != 1">
                      {{ gameStore.craftInfo[row.rcp].aoc }}
                    </template>
                    <abbr :title="gameStore.itemName(ik)">
                      <ItemIcon :ik="ik"/>
                    </abbr>
                  </template>
                </template>
                <template v-else>
                  {{ rcp }}
                </template>
              </td>
              <td class="tar" v-if="!row.collapsed" :rowspan="row.rowspan">
                <abbr class="tooltip" :title="row.tradeInfo.sellPriceDesc">{{ formatFixed(row.tradeInfo.sellPrice) }}</abbr>
              </td>
              <td class="tac">
                {{ row.perf.workers }}
              </td>
              <td class="tac">
                {{ formatFixed(row.perf.completionsPerDay) }}
              </td>
              <td class="tac">
                {{ row.thriftyPercent }}
              </td>
              <td class="tar">
                <abbr class="tooltip" :title="row.makeCost.desc">{{ formatFixed(row.makeCost.val) }}</abbr>
              </td>
              <td class="tar">
                {{ formatFixed(row.tradeInfo.transportFee) }}
              </td>
              <td class="tar">
                <abbr class="tooltip" :title="row.tradeInfo.deltaDesc">{{ formatFixed(row.tradeInfo.delta) }}</abbr>
              </td>
              <td class="tar">
                {{ formatFixed(row.tradeInfo.roi * 100) }}%
              </td>
              <td class="tar">
                {{ formatFixed(row.tradeInfo.dailyProfit, 2) }}
              </td>
              <td class="tar">
                <abbr class="tooltip" :title="row.tradeInfo.cpDesc">
                  {{ formatFixed(row.tradeInfo.cp, 2) }}</abbr>
              </td>
              <td class="tar">
                {{ formatFixed(row.tradeInfo.eff, 3) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="slider-container">
        Trading&nbsp;
        <input type="range" v-model.number="userStore.tradingLevel" min="1" max="140" step="1" >
        &nbsp;{{ tradingLevelString }} → {{ formatFixed(userStore.bargainBonus * 100, 1) }}% bargain
      </div>
      <div style="float: right;">
        <button @click="copyToWorkshops()" title="industry, M$/day, CP">copy to workshops</button>
      </div>
      <br/>
      Total:
      {{ formatFixed(userStore.tradingTable.total.silver/1000000, 1) }} M$/day,
      {{ formatFixed(userStore.tradingTable.total.CP, 2) }} CP,
      {{ formatFixed(userStore.tradingTable.total.eff, 3) }} M$/day/CP



      <details>
        <summary>Wagons</summary>
        Order issuing hours: <input type="number" class="w3em" v-model.number="userStore.pcHours">
        <br/>
        <!--At over 100% capacity, cost of transporting 214kLT:-->
        <table>
          <thead>
            <tr>
              <th>route</th>
              <th>duration</th>
              <th>needed</th>
              <th>capacity</th>
              <th>utilization</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tinfo, origDest in userStore.tradingTable.transport">
              <td>{{ origDest }}</td>
              <td>{{ tinfo.duration }}</td>
              <td class="tar">{{ formatFixed(tinfo.needWagons, 2) }}</td>
              <td class="tar">{{ tinfo.haveWagons }}</td>
              <td class="tar">
                {{ formatFixed(tinfo.utilization * 100, 2) }}%
              </td>
            </tr>
            <tr>
              <td class="tar" colspan="4"></td>
              <td class="tar">
                {{ formatFixed(userStore.tradingTable.total.transportUtilization * 100, 2) }}%
              </td>
            </tr>
          </tbody>
          </table>
      </details>

    </div>

    <div class="right">
      <h3>Input prices</h3>
      <table>
        <thead>
          <tr>
            <th>item</th>
            <th>custom</th>
            <th>buy</th>
            <th>eff</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ik in usedInputItems">
            <td>
              <abbr :title="gameStore.itemName(ik)">
                <ItemIcon :ik="Number(ik)"/>
              </abbr>
            </td>
            <td>
              <PriceInput v-model="userStore.customPrices[ik]"/>
            </td>
            <td class="tac">
              <input type="checkbox" :disabled="ik in gameStore.vendorPrices" v-model="userStore.keepItems[ik]">
            </td>
            <td class="tar">
              {{ formatFixed(marketStore.prices[ik]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  

</template>

<style scoped>

.container {
  display: flex;
}

.left, .right {
  height: 100%;
  overflow-y: auto;
  padding: 5px;
}

.tooltip {
  cursor: help;
}

summary {
  cursor: pointer;
}

.spacer {
  padding-left: 0.6em;
}

.striked {
  text-decoration: line-through;
}

</style>