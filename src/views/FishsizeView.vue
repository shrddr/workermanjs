<script>
import binomialTest from '@stdlib/stats-binomial-test';
import { formatFixed, makeIconSrc } from '../util.js'
import FishModel from '../components/droprateModels/FishModel.vue'

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

  },

  components: {
    VChart,
    FishModel,
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
      selectedFish: 8302,
      selectedLuck: 33,
      generalSigmas: 4,

      fish_info: {},

      
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
      const ret = []
      if (this.selectedFish in this.alldata) {

        for (const v of this.alldata[this.selectedFish]) {
          //ret.push(10 * v / this.avg_sizes[this.selectedFish])
          ret.push(v)
        }

      }
      return ret
    },

    weightedDataset() {
      // weight = chance of being lucky
      let dataByLuck = {}
      const data = this.currentDataset
      
      const len = data.length
      let luckyChances = []
      for (let k = 0; k < len; k++) {
        const chance = jStat.binomial.cdf( k, len, 1-this.selectedLuck/100 )
        luckyChances.push(chance)
      }
      dataByLuck = {
        len: len,
        luckyLen: len * this.selectedLuck/100,
        sorted: [...data].sort((a, b) => a-b),
        weights: luckyChances
      }
      
      //console.log('weightedDataset', dataByLuck)
      return dataByLuck
    },


    stats() {
      const dataRaw = this.currentDataset
      let lenRaw = dataRaw.length      

      const dataByLuck = this.weightedDataset
      let luckyLenHi = 0
      let luckyLenLo = 0

      for (let chance of dataByLuck.weights) {
        if (chance > this.stats.generalConfidence/100)
          luckyLenLo++
        if (chance > 1 - this.stats.generalConfidence/100)
          luckyLenHi++
      }
      

      let dataFlatSorted = []
      let weightsFlat = []
      let totalLuckyLen = 0
      let minLuck = 100
      let maxLuck = 0
      
      minLuck = Math.min(minLuck, this.selectedLuck)
      maxLuck = Math.max(maxLuck, this.selectedLuck)
      let {len, luckyLen, sorted, weights} = dataByLuck
      totalLuckyLen += luckyLen
      dataFlatSorted.push(...sorted)
      weightsFlat.push(...weights)
      

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
      

      console.log('stats', stats)
      return stats
    },

    histogram() {
      const ret = { arr: [], map: {} }
      if (this.stats.len > 0) {
        const binWidth = 1
        const max = this.stats.dataFlatSorted[this.stats.len - 1]
        const binCount = Math.ceil(max / binWidth)
        console.log('binCount', binCount)
        const histogram = Array(binCount).fill(0)

        for (const value of this.stats.dataFlatSorted) {
          const binIndex = Math.floor(value / binWidth)
          histogram[binIndex]++
        }

        for (let k = 0; k < binCount; k++) {
          const x1 = k * binWidth
          ret.arr.push([x1, histogram[k]])
          ret.map[x1] = histogram[k]
        }
      }
          

      if (this.stats.range > 0) {
        
        /*const bins = (this.stats.cap_hi - this.stats.cap_lo)
        //const dataFlatSorted_caps = [this.stats.cap_lo, ...this.stats.dataFlatSorted, this.stats.cap_hi]
        //console.log('dataFlatSorted_caps', dataFlatSorted_caps)
        let h = [1]
        h = jStat.histogram(this.stats.dataFlatSorted, bins)
        const ks = Array.from(Array(bins).keys())
        const hist = ks.map(k => [this.stats.cap_lo+k, h[k]])
        //console.log('hist', hist)
        ret.arr = hist*/
        
        
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
    makeIconSrc,
    binomialTest,

    async fetchObservations() {
      const start = Date.now()
      this.alldata = await (await fetch(`data/manual/my_catches.json`)).json()
      this.fish_info = await (await fetch(`data/manual/fish_info.json`)).json()

      const group_sizes = {}
      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const groupKey = `${info.BaseSize}_${info.FishVarySize}`
        const sample_count = sizes.length
        if (!(groupKey in group_sizes)) {
          group_sizes[groupKey] = {fishes: [], totalSamples: 0}
        }
        group_sizes[groupKey].fishes.push(ik)
        group_sizes[groupKey].totalSamples += sample_count
      }
      console.log('group_sizes', group_sizes)

      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const groupKey = `${info.BaseSize}_${info.FishVarySize}`
        const group = group_sizes[groupKey]
        if (group.fishes.length > 1 && group.totalSamples > 1000) {
          const groupName = group.fishes.join("+")
          console.log('filling group', groupName)
          if (!(groupName in this.alldata)) {
            this.alldata[groupName] = []
          }
          this.fish_info[groupName] = {BaseSize: info.BaseSize, FishVarySize: info.FishVarySize}
          for (const size of sizes) this.alldata[groupName].push(size)
        }
      }

      // TODO: scan all data, group by AvgSize and highlight with same
      
      console.log('fetchObservations took', Date.now()-start, 'ms')
    },

    activate(ik) {
      this.selectedFish = ik
    },

    get_fish_info(ik) {
      const ret = ik in this.fish_info ? this.fish_info[ik] : {"BaseSize": 0, "FishVarySize": 0}
      ret.avg_size = (ret.BaseSize + ret.FishVarySize) / 2
      return ret
    },
  }
}
</script>

<template>
  <main>
    <div id="menu">
      <div style="display: none;">{{ selectedFish }}</div>

      <template v-for="sizes, ik in alldata">
        <div v-if="sizes.length > 600">
          {{ ik }} {{ get_fish_info(ik).BaseSize }} {{ get_fish_info(ik).FishVarySize }} {{ get_fish_info(ik).avg_size }}
          <button
            :class="{ pressed: ik === selectedFish }"
            @click="activate(ik)"
          >
            {{ sizes.length }} points
          </button>
        </div>
      </template>
    </div>

    <div id="content">
      <input type="range" v-model="selectedLuck" min="0" max="100" :step="0.1" class="vmid">
      {{ selectedLuck }} luck

      <details>
        <summary>Dataset: size N = {{ stats.len }}, sum {{ formatFixed(stats.sum, 3) }}, 
          mean M = {{ formatFixed(stats.mean, 3) }}±{{ formatFixed(1.96 * stats.meanErr, 3) }},
        </summary>

        <div>
          <table>
            <tr>
              <td v-for="v in stats.dataRaw">{{ formatFixed(v, 3) }}</td>
            </tr>
          </table>
        </div>
      </details>

      <div>
        <FishModel 
          :stats="stats" 
          :histogram="histogram"
          :avg_size="fish_info[selectedFish] ? fish_info[selectedFish].avg_size : 1"
        />
      </div>

    </div>
  </main>
</template>

<style scoped>
#menu {
  position: fixed;
  /*width: 220px;*/
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