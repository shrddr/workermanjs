<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {formatFixed} from '../util.js'

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()
    const marketStore = useMarketStore()
    return { gameStore, userStore, marketStore }
  },
  data: () => ({
    
  }),
  watch: {
    
  },

  methods: {
    formatFixed,

    
  },

  computed: {
    plantzonesNearestCpTownsProfits150() {
      const start = Date.now()
      let ret = {}
      for (const pzk of Object.keys(this.gameStore.plantzones)) {
        ret[pzk] = this.gameStore.plantzoneNearestCpTownsProfits150(pzk, 3)
      }
      console.log('cpt: plantzonesNearestCpTownsProfits took', Date.now()-start, 'ms')
      return ret
    },
  },
  
}
</script>

<template>
  <div id="toptext">
    <p>Using 150/10/10 worker</p>
  </div>
  
  <table>
    <tr>
      <th>Node/Town</th>
      <th>connect</th>
      <th>distance</th>
      <th>M$/day</th>
      <th>M$/day/CP</th>
    </tr>

    <template v-for="pzd, pzk in gameStore.plantzones">
      <tr>
        <td colspan="5">
          <h3>{{ pzk }} {{ pzd.name }}</h3>

        </td>
      </tr>
      <tr v-for="townData in plantzonesNearestCpTownsProfits150[pzk]">
        <td>
        {{ gameStore.nodeName(townData.tnk) }} 
        </td>
        <td>
        {{ townData.cp }}CP 
        </td>
        <td>
        {{ formatFixed(townData.dist, 0) }}
        </td>
        <td>
        {{ formatFixed(townData.priceDaily, 2) }} 
        </td>
        <td>
        {{ formatFixed(townData.dailyPerCp, 3) }} 
        </td>
      </tr>
    </template>
  </table>

</template>

<style>
</style>
