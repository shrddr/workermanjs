<script>
import {useUserStore} from '../stores/user.js'
import {useGameStore} from '../stores/game.js'
import {useMarketStore} from '../stores/market'
import {formatFixed, hoursToHMS} from '../util.js'
import ItemIcon from '../components/lo/ItemIcon.vue'

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

  props: {
    show: {
      type: Boolean,
      default: false
    }
  },

  components: {
    ItemIcon,
  },

  created() {
    // this.fetchData()
  },

  data: () => ({
    cpCost: 0.4,
    pcHours: 16,
  }),

  computed: {
    perTownPerRecipePerThrifty() {
      const ret = {}
      for (const wsj of this.userStore.wsJobs) {
        const tnk = wsj.worker.tnk
        const rcp = wsj.worker.job.recipe
        const thriftyPercent = wsj.thriftyPercent
        if (!(rcp in this.gameStore.craftInputs)) {
          console.log('rcp', rcp, 'not supported')  // non stackable
          continue
        }

        if (!(tnk in ret)) { ret[tnk] = {} }
        if (!(rcp in ret[tnk])) { ret[tnk][rcp] = { } }
        if (!(thriftyPercent in ret[tnk][rcp])) { ret[tnk][rcp][thriftyPercent] = { workers: 0, cyclesPerDay: 0, completionsPerDay: 0 } }

        ret[tnk][rcp][thriftyPercent].workers += 1
        const industry = this.gameStore.craftInfo[rcp].rp
        const hk = wsj.worker.job.hk
        const workshop = this.userStore.userWorkshops[hk]
        const cyclesPerDay = this.gameStore.measureWorkshopWorker(hk, workshop, wsj.worker).cyclesDaily
        ret[tnk][rcp][thriftyPercent].cyclesPerDay += cyclesPerDay
        const repeats = this.gameStore.repeatsWorkshopWorker(wsj.worker, industry)
        const completionsPerDay = cyclesPerDay * repeats
        //console.log(industry, cyclesPerDay, repeats, completionsPerDay)
        ret[tnk][rcp][thriftyPercent].completionsPerDay += completionsPerDay
      }
      return ret
    },

    usedInputItems() {
      const ret = new Set([9492])
      if (!this.gameStore.ready) return ret
      for (const rcps of Object.values(this.perTownPerRecipePerThrifty)) {
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

    townStat() {
      const ret = {}
      const usedOrigins = new Set()
      for (const [origin, rcps] of Object.entries(this.perTownPerRecipePerThrifty)) {
        usedOrigins.add(origin)

        ret[origin] = { 
          workers: 0,
          completionsPerDay: 0,
          completionsPerDayDoubleEnded: 0,  // A→B & B→A connection combined
          reverseConnection: false,
        }
        const destination = this.userStore.tradeDestinations[origin]
        if (usedOrigins.has(destination)) {
          if (this.userStore.tradeDestinations[destination] == origin)
            ret[origin].reverseConnection = true
        }

        for (const thrifties of Object.values(rcps)) {
          for (const perf of Object.values(thrifties)) {
            ret[origin].workers += perf.workers
            ret[origin].completionsPerDay += perf.completionsPerDay
            //ret[origin].lt += perf.completionsPerDay * // crateWeight
          }
        }

        if (!ret[origin].reverseConnection) {
          ret[origin].completionsPerDayDoubleEnded += ret[origin].completionsPerDay
        }
        else {
          ret[destination].completionsPerDayDoubleEnded += ret[origin].completionsPerDay
          ret[origin].completionsPerDayDoubleEnded = ret[destination].completionsPerDayDoubleEnded
        }
      }
      return ret
    },

    rows() {
      const ret = {
        towns: {},  // tnk: { row, row, ... }
        transport: {},
        total: {
          silver: 0,
          CP: 0,
          transportUtilization: 0,
        },
      }
      if (!this.gameStore.ready) return ret
      for (const [origin, rcps] of Object.entries(this.perTownPerRecipePerThrifty)) {
        ret.towns[origin] = []
        const destination = this.userStore.tradeDestinations[origin]
        const routeBase = this.townStat[origin].reverseConnection ? destination : origin

        const hours = this.transportHours(origin, destination)
        const wagonRuns = Math.ceil(this.pcHours / hours)
        const transportCycles = Math.ceil(this.pcHours / hours)
        const transportLtPerDay = 5 * transportCycles * 30000
        if (!(origin in this.userStore.tradeRouteCp)) this.userStore.tradeRouteCp[origin] = 0
        
        const routeCp = this.userStore.tradeRouteCp[routeBase] // TODO: f(origin, destination)
        if (!(origin in this.userStore.tradeInfraCp)) this.userStore.tradeInfraCp[origin] = 0

        const origDest = `${this.gameStore.uloc.node[origin]} → ${this.gameStore.uloc.node[destination]}`
        if (!(origDest in ret.transport)) {
          //console.log(this.pcHours, hours, wagonRuns)
          const haveWagons = 5 * wagonRuns
          ret.transport[origDest] = {
            duration: hoursToHMS(hours),
            wagonRuns,
            haveWagons,
            needWagons: 0,
            utilization: 0,
          }
        }

        for (const [rcp, thrifties] of Object.entries(rcps)) {
          for (const [thriftyPercent, perf] of Object.entries(thrifties)) {
            const makeCost = this.recipeCost(rcp, Number(thriftyPercent))
            const avgRepeats = perf.completionsPerDay / perf.cyclesPerDay
            const feedCost = this.marketStore.prices[9492]
            const crateFeedCost = feedCost / 3 / avgRepeats
            makeCost.val += crateFeedCost
            makeCost.desc += `${feedCost} / 3 / ${formatFixed(avgRepeats, 2)} = ${formatFixed(crateFeedCost)}\n`

            //const workshopCostPerCrate = workshopCostDaily * perf.workers / perf.completionsPerDay
            //makeCost.val += workshopCostPerCrate
            //makeCost.desc += `${formatFixed(workshopCostDaily/1000000, 2)}M x ${perf.workers} / ${formatFixed(perf.completionsPerDay)} = ${formatFixed(workshopCostPerCrate)}\n`

            const tradeInfo = this.tradeInfo(rcp, origin, destination)

            tradeInfo.delta = tradeInfo.sellPrice - makeCost.val - tradeInfo.transportFee
            tradeInfo.deltaDesc = `${formatFixed(tradeInfo.sellPrice)} - ${formatFixed(makeCost.val)} - ${formatFixed(tradeInfo.transportFee)}`
            tradeInfo.roi = tradeInfo.delta / (makeCost.val + tradeInfo.transportFee)
            tradeInfo.dailyProfit = tradeInfo.delta * perf.completionsPerDay / 1000000
            tradeInfo.routeCp = this.userStore.tradeRouteAlwaysOn[routeBase] 
              ? routeCp * perf.completionsPerDay / this.townStat[origin].completionsPerDayDoubleEnded
              : routeCp * perf.completionsPerDay * tradeInfo.crateWeight / transportLtPerDay
            const routeCpDesc = this.userStore.tradeRouteAlwaysOn[origin]
              ? `${routeCp}CP * ${formatFixed(perf.completionsPerDay)} / ${formatFixed(this.townStat[origin].completionsPerDayDoubleEnded)} crates`
              : `${routeCp}CP * ${formatFixed(perf.completionsPerDay * tradeInfo.crateWeight / transportLtPerDay * 100, 3)}% utilization`
            tradeInfo.cp = this.userStore.tradeInfraCp[origin] / this.townStat[origin].workers * perf.workers + tradeInfo.routeCp
            tradeInfo.cpDesc = `${this.userStore.tradeInfraCp[origin]}CP / ${this.townStat[origin].workers} x ${perf.workers} workers + ${routeCpDesc}`
            tradeInfo.eff = tradeInfo.dailyProfit / tradeInfo.cp

            const prevRow = ret.towns[origin][ret.towns[origin].length - 1]
            const collapsed = (prevRow && rcp == prevRow.rcp)

            ret.towns[origin].push({
              rcp, collapsed, rowspan: 1,
              thriftyPercent,
              makeCost,
              perf,
              tradeInfo,
            })

            ret.transport[origDest].needWagons += perf.completionsPerDay * tradeInfo.crateWeight / 30000

            ret.total.silver += perf.completionsPerDay * tradeInfo.delta
            ret.total.CP += tradeInfo.cp
          }
        }
      }

      for (const tinfo of Object.values(ret.transport)) {
        tinfo.utilization = tinfo.needWagons / tinfo.haveWagons
        ret.total.transportUtilization += tinfo.utilization
      }

      ret.total.eff = ret.total.silver / 1000000 / ret.total.CP
      return ret
    },

    table() {
      // semantic sugar to not call this.rows from template twice
      const a = this.rows
      // collapse `out` and `sell`
      let incrementingRow
      for (const [origin, rows] of Object.entries(a.towns)) {
        for (const row of rows) {
          if (!row.collapsed) incrementingRow = row
          else incrementingRow.rowspan++
        }
      }
      return this.rows
    }
  },

  methods: {
    formatFixed,
    hoursToHMS,
    
    recipeCost(rcp, thriftyPercent) {
      //console.log('recipeCost', rcp, thriftyPercent)
      if (!(rcp in this.gameStore.craftInputs)) {
        const desc = `recipe ${rcp} can't be priced`
        console.log(desc)
        return {
          val: NaN,
          desc,
        }
      }
      const inputs = this.gameStore.craftInputs[rcp]
      if (thriftyPercent > 0) {
        const inputsCopy = {}
        const inputsCount = Object.entries(inputs).length
        for (const ik of Object.keys(inputs)) {
          if (inputs[ik] >= 10) {
            const thriftable = Math.floor(inputs[ik] / 10)
            const thrifted = thriftable * (1 - thriftyPercent/inputsCount/100)
            inputsCopy[ik] = inputs[ik] - thriftable + thrifted
            //console.log('applied thrifty', rcp, ik, thriftyPercent, inputsCopy[ik])
          }
          else {
            inputsCopy[ik] = inputs[ik]
          }
        }
        return this.marketStore.priceBunch(inputsCopy)
      }
      return this.marketStore.priceBunch(inputs)
    },
    
    distanceToTrader(tnka, tnkb) {
      if (!(this.gameStore.ready)) return NaN
      if (!tnka) return NaN
      if (!tnkb) return NaN
      const a = this.gameStore.nodes[tnka].pos
      const b = this.gameStore.traders[tnkb]
      const dx = a.x-b[0]
      const dy = 0
      const dz = a.z-b[1]
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz)
      return dist
    },
    
    distancePriceBonus(tnka, tnkb) {
      const dist = this.distanceToTrader(tnka, tnkb)
      const bonus = dist * 68 / 100000000
      return bonus > 1.5 ? 1.5 : bonus
    },
    
    distance(tnka, tnkb) {
      if (!(this.gameStore.ready)) return NaN
      if (!tnka) return NaN
      if (!tnkb) return NaN
      const a = this.gameStore.nodes[tnka].pos
      const b = this.gameStore.nodes[tnkb].pos
      const dx = a.x-b.x
      const dy = 0
      const dz = a.z-b.z
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz)
      return dist
    },

    transportCostPerLt(tnka, tnkb, unconnected) {
      const dist = this.distance(tnka, tnkb)
      const cost = dist * 1.8 / 30000
      return unconnected ? cost * 4 : cost
    },
    
    transportHours(tnka, tnkb) {
      // yuk-alt 5:59:??
      // val-dal 6:18:??
      // val-yuk 7:12:??
      const dist = this.distance(tnka, tnkb)
      const hours = dist * 2.6 / 1000000
      return hours
    },

    tradeInfo(rcp, origin, destination) {
      //console.log('tradeInfo', ik, origin, destination)
      if (!(this.gameStore.ready)) return NaN
      if (!(rcp in this.gameStore.craftOutputs)) return NaN
      const ik = this.gameStore.craftOutputs[rcp][0]
      if (!(ik in this.gameStore.itemInfo)) return NaN

      const basePrice = this.gameStore.itemInfo[ik].vendorPrice
      const distanceBonus = this.distancePriceBonus(origin, destination)
      const sellPrice = basePrice * (1 + distanceBonus) * (1 + this.userStore.bargainBonus)
      const sellPriceDesc = `${basePrice} x ${1 + distanceBonus} x ${(1 + this.userStore.bargainBonus)}`
      
      const crateWeight = this.gameStore.itemInfo[ik].weight
      //const stackSize = Math.floor(2147483648 / crateWeight / 100)
      const costPerLt = this.transportCostPerLt(origin, destination)
      const transportFee = crateWeight * costPerLt
      //console.log('tradeInfo', sellPrice, crateTransportCost, transportedSellPrice)
      return { 
        destination, distanceBonus, crateWeight, costPerLt,
        sellPrice, sellPriceDesc,
        transportFee
      }
    },

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
      const rcp = 9212  // TODO: does this matter?
      for (const destination of Object.keys(this.gameStore.traders)) {
        ret.push(this.tradeInfo(rcp, origin, destination))
      }
      ret.sort((a,b) => (b.sellPrice-b.transportFee)-(a.sellPrice-a.transportFee))  // TODO: connection cost
      return ret
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
              <abbr class="tooltip" title="workers">w</abbr>
            </th>
            <th>
              <abbr class="tooltip" title="crates/day">c/d</abbr>
            </th>
            <th>
              <abbr class="tooltip" title="thrifty %">🧪</abbr>
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
          <template v-for="rows, origin in table.towns">
            <tr>
              <td colspan="2" class="tac">
                {{ gameStore.uloc.node[origin] }}
              </td>
              <td colspan="4" class="tac">
                <abbr class="tooltip" title="total town infrastructure per 1 packer 
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
                    {{ formatFixed(30 * e.costPerLt) }}$
                  </option>
                </select>
                
                <template v-if="townStat[origin].reverseConnection == false">
                  cost
                  <input 
                    v-model.number="userStore.tradeRouteCp[origin]"
                    type="number" 
                    class="w3em">
                  CP
                  
                  <span class="spacer"></span>
                  <input type="checkbox" v-model="userStore.tradeRouteAlwaysOn[origin]"> always on
                </template>
                <template v-else>(reusing)</template>
              </td>
            </tr>

            <tr v-for="row in rows" :key="row.tnk + '/' + row.rcp">
              <td v-if="!row.collapsed" :rowspan="row.rowspan">
                <template v-if="row.rcp && gameStore.craftOutputs[row.rcp]">
                  <template v-for="ik in gameStore.craftOutputs[row.rcp]">
                    <ItemIcon :ik="ik"/>
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
      <br/>
      Total:
      {{ formatFixed(table.total.silver/1000000, 1) }} M$/day,
      {{ formatFixed(table.total.CP, 2) }} CP,
      {{ formatFixed(table.total.eff, 3) }} M$/day/CP



      <details>
        <summary>Wagons</summary>
        Order issuing hours: <input type="number" class="w3em" v-model.number="pcHours">
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
            <tr v-for="tinfo, origDest in table.transport">
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
                {{ formatFixed(table.total.transportUtilization * 100, 2) }}%
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
              <ItemIcon :ik="Number(ik)"/>
            </td>
            <td>
              <input type="number" class="w5em tar" v-model.number="userStore.customPrices[ik]">
            </td>
            <td>
              <input type="checkbox" :disabled="ik in gameStore.vendorPrices" v-model="userStore.keepItems[ik]">
            </td>
            <td>
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