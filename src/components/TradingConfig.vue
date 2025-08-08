<script>
import {useUserStore} from '../stores/user.js'
import {useGameStore} from '../stores/game.js'
import {useMarketStore} from '../stores/market'
import {formatFixed} from '../util.js'
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
    houses: {},

  }),

  computed: {
    perTownPerRecipe() {
      const ret = {}
      for (const wsj of this.userStore.wsJobs) {
        const tnk = wsj.worker.tnk
        const rcp = wsj.worker.job.recipe
        if (!(rcp in this.gameStore.craftInputs)) continue  // non stackable
        if (!(tnk in ret)) { ret[tnk] = {} }
        if (!(rcp in ret[tnk])) { ret[tnk][rcp] = 0 }
        ret[tnk][rcp] += 1
      }
      return ret
    },

    usedInputItems() {
      const ret = new Set()
      if (!this.gameStore.ready) return ret
      for (const rcps of Object.values(this.perTownPerRecipe)) {
        for (const rcp of Object.keys(rcps)) {
          if (!(rcp in this.gameStore.craftInputs)) {
            console.log('rcp', rcp, 'not supported')
            continue
          }
          const inputs = this.gameStore.craftInputs[rcp]
          for (const ik of Object.keys(inputs)) {
            ret.add(ik)
          }
        }
      }
      return ret
    },

    tradingLevelString() {
      const i = this.userStore.tradingLevel;
      if (90 < i) return `G${i - 90}`;
      if (60 < i) return `M${i - 60}`;
      return `${i}`;
    },
  },

  methods: {
    formatFixed,
    
    recipeCost(rcp) {
      if (!(rcp in this.gameStore.craftInputs)) {
        console.log('recipe', rcp, "can't be priced")
        return NaN
      }
      const inputs = this.gameStore.craftInputs[rcp]
      const ret = this.marketStore.priceBunch(inputs)
      return ret
    },
    
    distance(tnka, tnkb) {
      if (!(this.gameStore.ready)) return NaN
      if (!tnka) return NaN
      if (!tnkb) return NaN
      const a = this.gameStore.traders[tnka]
      const b = this.gameStore.traders[tnkb]
      const dx = a[0]-b[0]
      const dy = 0
      const dz = a[1]-b[1]
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz)
      return dist
    },
    
    distancePriceMult(tnka, tnkb) {
      const dist = this.distance(tnka, tnkb)
      const mult = dist * 68 / 100000000
      return mult > 1.5 ? 1.5 : mult
    },
    
    transportCostPerLt(tnka, tnkb, unconnected) {
      const dist = this.distance(tnka, tnkb)
      const cost = dist * 1.8 / 30000
      return unconnected ? cost * 4 : cost
    },

    sellInfo(ik, origin, nk) {
      //console.log('sellInfo', ik, origin, nk)
      if (!(this.gameStore.ready)) return NaN
      if (!(ik in this.gameStore.itemInfo)) return NaN
      const basePrice = this.gameStore.itemInfo[ik].vendorPrice
      const distanceMult = this.distancePriceMult(origin, nk)
      const sellPrice = basePrice * distanceMult * (1 + this.userStore.bargainBonus)
      
      const crateWeight = this.gameStore.itemInfo[ik].weight
      //const stackSize = Math.floor(2147483648 / crateWeight / 100)
      const costPerLt = this.transportCostPerLt(origin, nk)
      const crateTransportCost = crateWeight * costPerLt
      const transportedSellPrice = sellPrice - crateTransportCost
      //console.log('sellInfo', sellPrice, crateTransportCost, transportedSellPrice)
      return { nk, distanceMult, sellPrice, costPerLt, transportedSellPrice }
    },

    sortedTraders(ik, origin) {
      const ret = []
      for (const destination of Object.keys(this.gameStore.traders)) {
        ret.push(this.sellInfo(ik, origin, destination))
      }
      ret.sort((a,b) => b.transportedSellPrice-a.transportedSellPrice)
      return ret
    },
  },

}
</script>

<template>
  <h3>🤷Trading overview</h3>
  <div class="container">
    <div class="left">
      <h2>Input prices</h2>
      not configurable for now
      <table>
        <thead>
          <tr>
            <th>item</th>
            <th>price</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ik in usedInputItems">
            <td>
              <ItemIcon :ik="Number(ik)"/>
            </td>
            <td>
              {{ formatFixed(marketStore.apiPrices[ik]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="right">
      <h2>Active recipes</h2>
      Trading {{ tradingLevelString }}
      <input
        type="range"
        v-model.number="userStore.tradingLevel"
        min="1"
        max="140"
        step="1"
      > {{ formatFixed(userStore.bargainBonus * 100, 1) }}% bargain<br/>
      <table>
        <thead>
          <tr>
            <th>Town</th>
            <th>count</th>
            <th>recipe</th>
            <th>cost $</th>
            <th>sell to</th>
            <th>sell $</th>
            <th>Δ$</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="rcps, tnk in perTownPerRecipe">
            <tr v-for="count, rcp in rcps">
              <td>{{ gameStore.uloc.node[tnk] }}</td>
              <td>{{ count }}</td>
              <td>
                <template v-if="rcp && gameStore.craftOutputs[rcp]">
                  <template v-for="ik in gameStore.craftOutputs[rcp]">
                    <ItemIcon :ik="ik"/>
                  </template>
                </template>
                <template v-else>
                  {{ rcp }}
                </template>
              </td>
              <td>
                {{ formatFixed(this.recipeCost(rcp)) }}
              </td>
              <td>
                <select v-model="userStore.tradeDestinations[tnk+'/'+rcp]">
                  <option v-for="e in sortedTraders(gameStore.craftOutputs[rcp][0], tnk)" :key="e.nk" :value="e.nk">
                    {{ gameStore.uloc.node[e.nk] }}
                    {{ formatFixed(e.distanceMult*100, 2) }}%
                    {{ formatFixed(30 * e.costPerLt) }}$/30LT
                  </option>
                </select>
              </td>
              <td>
                {{ formatFixed(sellInfo(gameStore.craftOutputs[rcp][0], tnk, userStore.tradeDestinations[tnk+'/'+rcp]).transportedSellPrice) }}
              </td>
              <td>
                {{ formatFixed(sellInfo(gameStore.craftOutputs[rcp][0], tnk, userStore.tradeDestinations[tnk+'/'+rcp]).transportedSellPrice - this.recipeCost(rcp)) }}
              </td>
            </tr>
          </template>
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
  padding: 20px;
}

.tooltip {
  cursor: help;
}

</style>