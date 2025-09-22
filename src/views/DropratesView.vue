<script>
import binomialTest from '@stdlib/stats-binomial-test';
import { useDropratesStore } from '../stores/droprates'
import { useGameStore } from '../stores/game'
import { formatFixed } from '../util.js'
import ItemIcon from '../components/lo/ItemIcon.vue'
import DRMA from '../components/droprateModels/DRMA.vue'
import DRMB from '../components/droprateModels/DRMB.vue'
import DRMC from '../components/droprateModels/DRMC.vue'

import { jStat } from 'jstat-esm';

import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from "echarts/components";
import VChart, { THEME_KEY } from "vue-echarts";
import { provide } from 'vue'
import { computed } from 'vue'

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
  MarkAreaComponent,
]);

export default {
  setup() {
    const gameStore = useGameStore()
    const dropratesStore = useDropratesStore()
    const d = localStorage.getItem('droprates')
    dropratesStore.$patch(JSON.parse(d))

    dropratesStore.$subscribe((mutation, state) => {
      //console.log('dropratesStore subscription', state)
      localStorage.setItem('droprates', JSON.stringify(state))
    })

    return { gameStore, dropratesStore }
  },

  components: {
    ItemIcon,
    VChart,
    DRMA,
    DRMB,
    DRMC,
  },

  provide() {
    return {
      [THEME_KEY]: computed(() => this.darkMode ? 'dark' : 'default')
    }
  },

  data() {
    const darkModeQuery = matchMedia('(prefers-color-scheme: dark)')
    return {
      alldata: {},

      generalSigmas: 2,
      hide_buckets: {},

      darkModeQuery,
      darkMode: darkModeQuery.matches,
    }
  },

  created() {
    this.fetchObservations()
  },

  mounted() {
    this.darkModeQuery.addEventListener("change", () => {
      this.darkMode = this.darkModeQuery.matches
    })
  },

  watch: {

  },

  computed: {
    currentDataset() {
      const dataRaw = {}
      if (this.dropratesStore.selected_pzk in this.alldata) {
        const node_data = this.alldata[this.dropratesStore.selected_pzk]
        if (this.dropratesStore.selected_ik in node_data) {
          const item_data = node_data[this.dropratesStore.selected_ik]
          if (this.dropratesStore.selected_specie in item_data) {
            const specie_data = item_data[this.dropratesStore.selected_specie]
            for (let [luck, data] of Object.entries(specie_data).sort((a, b) => a[0]-b[0])) {
              dataRaw[luck] = data
            }
          }
        }
      } 
      return dataRaw
    },

    weightedDataset() {
      // weight = chance of being lucky
      let dataByLuck = {}
      for (let [luck, data] of Object.entries(this.currentDataset)) {
        if (this.hide_buckets[luck])
          continue
        const len = data.length
        let luckyChances = []
        for (let k = 0; k < len; k++) {
          const chance = jStat.binomial.cdf( k, len, 1-luck/100 )
          luckyChances.push(chance)
        }
        dataByLuck[luck] = {
          len: len,
          luckyLen: len * luck/100,
          sorted: [...data].sort((a, b) => a-b),
          weights: luckyChances
        }
      }
      //console.log('weightedDataset', dataByLuck)
      return dataByLuck
    },

    stats() {
      const dataRaw = this.currentDataset
      let lenRaw = 0
      let lenNz = 0
      for (const [luck, drops] of Object.entries(dataRaw)) {
        lenRaw += dataRaw[luck].length
        lenNz += dataRaw[luck].length
      }

      const dataByLuck = this.weightedDataset
      let luckyLenHi = 0
      let luckyLenLo = 0
      for (let [luck, data] of Object.entries(dataByLuck)) {
        for (let chance of data.weights) {
          if (chance > this.stats.generalConfidence/100)
            luckyLenLo++
          if (chance > 1 - this.stats.generalConfidence/100)
            luckyLenHi++
        }
      }

      let dataFlatSorted = []
      let weightsFlat = []
      let totalLuckyLen = 0
      let minLuck = 100
      let maxLuck = 0
      for (const [luck, data] of Object.entries(dataByLuck)) {
        minLuck = Math.min(minLuck, luck)
        maxLuck = Math.max(maxLuck, luck)
        let {len, luckyLen, sorted, weights} = data
        totalLuckyLen += luckyLen
        dataFlatSorted.push(...sorted)
        weightsFlat.push(...weights)
      }
      const sigmas2confidence = {
        1.5: 86.6385597,
        2: 95.4499736,
        2.5: 98.7580669,
        3: 99.7300203,
        3.5: 99.9534741841929,
        4: 99.9936657516334,
      }
      const stats = {
        generalSigmas: this.generalSigmas,
        generalConfidence: sigmas2confidence[this.generalSigmas],
        lenRaw: lenRaw,
        dataRaw: dataRaw,
        dataByLuck: dataByLuck,
        minLuck: minLuck, maxLuck: maxLuck,
        dataFlatSorted: dataFlatSorted,
        weightsFlat: weightsFlat,
        len: dataFlatSorted.length,
        min: jStat.min(dataFlatSorted), 
        max: jStat.max(dataFlatSorted), 
        range: jStat.range(dataFlatSorted),
        sum: jStat.sum(dataFlatSorted),
        mean: jStat.mean(dataFlatSorted),
        meanErr: 0,
        meanLo: 0,
        meanHi: 0,
        std: jStat.stdev(dataFlatSorted, true),
        bell: [],
        histo: [],
      }
      
      /* 
      Standard deviation is the sqrt of the variance of a distribution;
      standard error is the standard deviation of the estimated mean of a sample from that distribution,
      i.e., the spread of the means you would observe if you did that sample infinitely many times.

      distrubution: Binomial(k, p) 
      distribution variance: kpq
      distribution stddev: sqrt(kpq)
      take n samples of that and calculate their mean (x/n+x/n+...)
      var(x+y) = var(x)+var(y)
      var(ax) = a² var(x)
      var(x1/n+x2/n+...) = n var(x) / n²
      hence, variance of that mean: kpq/n
      standard error of mean = sqrt(kpq/n)
      */

      stats.meanErr = Math.sqrt(stats.mean/stats.max*(1-stats.mean/stats.max)*stats.max/stats.len)
      stats.meanLo = stats.mean - this.generalSigmas * stats.meanErr
      stats.meanHi = stats.mean + this.generalSigmas * stats.meanErr

      stats.lucky = { 
        len: totalLuckyLen,
        share: totalLuckyLen / stats.len,
        mean: 0,
        std: 0,
        /*lenHi: luckyLenHi,
        lenLo: luckyLenLo,
        shareHi: luckyLenHi / stats.len,
        shareLo: luckyLenLo / stats.len,*/
        lenHi: 0,
        lenLo: 0,
        shareHi: 0,
        shareLo: 0,
      }

      if (isNaN(stats.lucky.share)) {
        stats.lucky.shareLo = NaN
        stats.lucky.shareHi = NaN
        stats.lucky.lenLo = NaN
        stats.lucky.lenHi = NaN
      }
      else {
        console.log('binomTest of lucky share%=', stats.lucky.share, 'with significance=', 1-stats.generalConfidence/100)
        const luckyStats = this.binomialTest(
          Math.round(stats.lucky.len), 
          stats.len, 
          {
            p: stats.lucky.share,
            alpha: 1-stats.generalConfidence/100,
          } 
        )
        stats.lucky.shareLo = luckyStats.ci[0]
        stats.lucky.shareHi = luckyStats.ci[1]
        stats.lucky.lenLo = luckyStats.ci[0] * stats.len
        stats.lucky.lenHi = luckyStats.ci[1] * stats.len
      }

      stats.unlucky = { 
        len: stats.len - totalLuckyLen, 
        share: 1 - stats.lucky.share, 
        mean: 0, 
        std: 0,
      }

      // makeWeightedStats

      let accMeanU = 0
      let accMeanL = 0
      for (const [luck, data] of Object.entries(dataByLuck)) {
        let {len, luckyLen, luckeyLen95, sorted, weights} = data
        for (let k = 0; k < len; k++) {
          const v = sorted[k]
          const w = weights[k]
          accMeanU += v * (1 - w)
          accMeanL += v * w
        }
      }
      stats.unlucky.mean = accMeanU / stats.unlucky.len
      stats.lucky.mean = accMeanL / stats.lucky.len

      let accStdU = 0
      let accWU = 0
      let accStdL = 0
      for (const [luck, data] of Object.entries(dataByLuck)) {
        let {len, sorted, weights} = data
        for (let k = 0; k < len; k++) {
          const w = weights[k]
          const eu = sorted[k] - stats.unlucky.mean
          accStdU += eu * eu * (1 - w)
          const el = sorted[k] - stats.lucky.mean
          accStdL += el * el * w
        }
      }
      stats.unlucky.std = Math.sqrt( accStdU / stats.unlucky.len )
      stats.lucky.std = Math.sqrt( accStdL / stats.lucky.len )

      console.log('stats', stats)
      return stats
    },

    histogram() {
      const ret = { arr: [], map: {} }
      if (this.stats.range > 0) {
        let h = [1]
        h = jStat.histogram(this.stats.dataFlatSorted, this.stats.range + 1)
        const ks = Array.from(Array(this.stats.range + 1).keys())
        const hist = ks.map(k => [this.stats.min+k, h[k]])
        //console.log('hist', hist)
        ret.arr = hist
        
        for (let i = 0; i < h.length; i++)
          ret.map[this.stats.min+i] = h[i]
      }
      else {
        ret.arr = [[this.stats.min, this.stats.len]]
        ret.map[this.stats.min] = this.stats.len
      }
      console.log('histogram', ret)
      return ret
    },
  },

  methods: {
    formatFixed,
    binomialTest,

    async fetchObservations() {
      const start = Date.now()
      this.alldata = await (await fetch(`data/manual/yields_observed_202505_202509.json`)).json()
      
      const pz = this.dropratesStore.selected_pzk
      this.dropratesStore.selected_pzk = (pz && this.alldata[pz]) ? pz : Object.keys(this.alldata)[0]
      const i = this.dropratesStore.selected_ik
      this.dropratesStore.selected_ik = (i && this.alldata[pz][i]) ? i : Object.keys(this.alldata[pz])[0]
      const s = this.dropratesStore.selected_specie
      this.dropratesStore.selected_specie = (s && this.alldata[pz][i][s]) ? s : Object.keys(this.alldata[pz][i])[0]
      
      console.log('fetchObservations took', Date.now()-start, 'ms',
        this.dropratesStore.selected_pzk,
        this.dropratesStore.selected_ik,
        this.dropratesStore.selected_specie
      )
    },

    activate(pzk, ik, specie) {
      this.dropratesStore.selected_pzk = pzk
      this.dropratesStore.selected_ik = ik
      this.dropratesStore.selected_specie = specie
    }
  }
}
</script>

<template>
  <main>
    <div id="menu">
      <div style="display: none;">{{ dropratesStore.selected_pzk }} {{ dropratesStore.selected_ik }} {{ dropratesStore.selected_specie }}</div>
      
      <p class="fsxs">Left: droprate parameters currently used in workerman</p>
      <p class="fsxs">Right: observations used to find out current serverside parameters</p>

      <template v-for="nodedata, pzk in alldata">
        <RouterLink v-if="pzk in gameStore.plantzoneStatic" tag="a" :to="{path: './', hash: '#node' + pzk}">
          {{ pzk }} {{ gameStore.plantzoneName(pzk) }}
        </RouterLink>
        <span v-else>{{ pzk }}</span>
        <table>
          <tr>
            <th class="fsxs">n</th>
            <th class="fsxs">npᵁ</th>
            <th class="fsxs">npᴸ</th>
            <th class="fsxs">item</th>
            <th class="fsxs">normal</th>
            <th class="fsxs">giant</th>
          </tr>
          <tr v-for="nodeitemdata, ik in nodedata">
            <td class="fsxs">
              <template v-if="gameStore.ready && Number(pzk) in gameStore.plantzones">
                {{ gameStore.plantzones[Number(pzk)].rolls }}
              </template>
            </td>
            <td class="fsxs">
              <template v-if="gameStore.ready && Number(pzk) in gameStore.plantzones && ik in gameStore.plantzones[Number(pzk)].unlucky">
                {{ gameStore.plantzones[Number(pzk)].unlucky[ik] }}
              </template>
            </td>
            <td class="fsxs">
              <template v-if="gameStore.ready && Number(pzk) in gameStore.plantzones && ik in gameStore.plantzones[Number(pzk)].lucky">
                {{ gameStore.plantzones[Number(pzk)].lucky[ik] }}
              </template>
            </td>
            <td>
              <RouterLink tag="a" :to="{path: './settings', hash: '#item' + ik}">
                <span>
                  <ItemIcon :ik="Number(ik)"/>
                </span>
              </RouterLink>
              {{ gameStore.itemName(ik) }}
            </td>
            <td v-for="specie in ['normal', 'giant']" class="center">
              <template v-if="specie in nodeitemdata">
                <button :title="`item ${ik} ${specie}`" v-if="pzk != dropratesStore.selected_pzk || ik != dropratesStore.selected_ik || specie != dropratesStore.selected_specie" @click="activate(pzk, ik, specie)">
                  {{ Object.values(nodeitemdata[specie]).flat().length }} 
                </button>
                <button :title="`item ${ik} ${specie}`" v-else class="pressed">
                  {{ Object.values(nodeitemdata[specie]).flat().length }}
                </button>
              </template>
            </td>
          </tr>
        </table>
      </template>
    </div>

    <div id="content">

      <details>
        <summary>Dataset: size N = {{ stats.len }}, sum {{ stats.sum }}, 
          mean M = {{ formatFixed(stats.mean, 3) }}±{{ formatFixed(1.96 * stats.meanErr, 3) }},
          <template v-if="this.stats.minLuck == this.stats.maxLuck">
            {{ this.stats.maxLuck }}
          </template>
          <template v-else>
            {{ formatFixed(this.stats.minLuck, 2) }}…{{ formatFixed(this.stats.maxLuck, 2) }}
          </template>🍀 → 
          λ ∈ {{ formatFixed(stats.lucky.shareLo*100, 2) }}…{{ formatFixed(stats.lucky.shareHi*100, 2) }}% cycles were lucky
        </summary>

        <div>
          <table>
            <tr>
              <td>mute</td><td>luck</td>
            </tr>
            <tr v-for="drops, luck in stats.dataRaw" :class="{ strike: hide_buckets[luck] }">
              <td class="center"><input v-model="hide_buckets[luck]" type="checkbox"></td>
              <td>{{ luck }}</td>
              <td v-for="drop in drops">{{ drop }}</td>
            </tr>
          </table>
        </div>

        <p>
          Possible luck procs observed with 
          <select v-model="generalSigmas">
            <option value="1.5">±1.5σ</option>
            <option value="2">±2σ</option>
            <option value="2.5">±2.5σ</option>
            <option value="3">±3σ</option>
            <option value="3.5">±3.5σ</option>
            <option value="4">±4σ</option>
          </select>
          ({{ formatFixed(stats.generalConfidence, 2) }}%)
          confidence:
          <table>
            <tr><th></th><th>min</th><th>max</th></tr>
            <tr>
              <td>count</td>
              <td>{{ formatFixed(stats.lucky.lenLo, 2) }}</td>
              <td>{{ formatFixed(stats.lucky.lenHi, 2) }}</td>
            </tr>
            <tr>
              <td>% of total</td>
              <td>{{ formatFixed(stats.lucky.shareLo*100, 2) }}</td>
              <td>{{ formatFixed(stats.lucky.shareHi*100, 2) }}</td>
            </tr>
          </table>
        </p>
      </details>

      <div id="settings">
        <!--<input type="checkbox" v-model="dropratesStore.usePooling">Pooling-->
        Use model:<br/>
      
        <input type="radio" id="option1" value="a" v-model="dropratesStore.selected_model">
        <label for="option1">A. Same item drop regardless of luck (plants, lumber, ores)<br/></label>
        
        <input type="radio" id="option2" value="b" v-model="dropratesStore.selected_model">
        <label for="option2">B. Item only drops when luck procs (sacks, lumbering rares)<br/></label>
        
        <input type="radio" id="option3" value="c" v-model="dropratesStore.selected_model">
        <label for="option3">C. Different drops when luck procs and when not (eggs, honey)<br/></label>
      </div>

      <div id="modelA" v-if="dropratesStore.selected_model=='a'" style="float:left;">
        <DRMA 
          :stats="stats" 
          :histogram="histogram" 
          :isGiant="dropratesStore.selected_specie == 'giant'"
        />
      </div>
      
      <div v-if="dropratesStore.selected_model=='b'">
        <DRMB 
          :stats="stats" 
          :histogram="histogram" 
        />
      </div>

      <div v-if="dropratesStore.selected_model=='c'">
        <DRMC 
          :stats="stats" 
          :histogram="histogram"
          :isGiant="dropratesStore.selected_specie == 'giant'"
        />
      </div>

    </div>
  </main>
</template>

<style scoped>
#menu {
  position: fixed;
  width: 370px; 
  height: 90vh; 
  overflow-y: scroll;
}

#content {
  position: absolute;
  padding-left: 2em;
  left: 370px;
}

#settings {
  padding: 9px 0 9px 0;
}

.warning {
  background-color: rgba(255, 0, 0, 0.3);
}

.title {
    font-size: 1.17em;
    font-weight: bold;
  }
table {
  border-collapse: collapse;
}
td,
th {
  padding: 1px 2px 1px 2px;
  border: 1px solid gray;
}

td .r {
  text-align: right;
  font-family: monospace;
}
.center {
  text-align: center;
}
ul {
  padding-left: 0px;
}
</style>