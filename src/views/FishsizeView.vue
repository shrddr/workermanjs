<script>
import binomialTest from '@stdlib/stats-binomial-test';
import { formatFixed, isNumber, makeIconSrc } from '../util.js'
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
      mode_relative: true,
      relative_base: 100,

      alldata: {},
      selectedFish: 'ALL',
      selectedLuck: 68.3,
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
        const info = this.get_fish_info(this.selectedFish)
        for (const v of this.alldata[this.selectedFish]) {
          if (this.mode_relative)
            ret.push(this.relative_base * v / info.avg_size)
          else
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

      dataByLuck.grouped = dataByLuck.sorted.reduce((acc, num) => {
        const key = Math.floor(num);
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(num);
        return acc;
      }, {})
      
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
      let {len, luckyLen, sorted, weights, grouped} = dataByLuck
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
    isNumber,
    makeIconSrc,
    binomialTest,

    async fetchObservations() {
      const start = Date.now()
      this.alldata = await (await fetch(`data/manual/catches_by_fish.json`)).json()
      this.fish_info = await (await fetch(`data/manual/fish_info.json`)).json()

      if (this.mode_relative) {
        console.log('filling group ALL')
        const all = []
        
        for (const [ik, sizes] of Object.entries(this.alldata)) {
          const info = this.get_fish_info(ik)
          const avg_size = (info.BaseSize + info.FishVarySize) / 2
          for (const v of sizes) all.push(this.relative_base * v / avg_size)
        }
        this.alldata['ALL'] = all
        this.fish_info['ALL'] = {BaseSize: 'x', FishVarySize: 'x', avg_size: this.relative_base}
      }

      const bs_group_sizes = {}
      const avg_group_sizes = {}

      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const groupKey = `${info.BaseSize}_${info.FishVarySize}`
        const sample_count = sizes.length
        if (!(groupKey in bs_group_sizes)) {
          bs_group_sizes[groupKey] = {fishes: [], totalSamples: 0}
        }
        bs_group_sizes[groupKey].fishes.push(ik)
        bs_group_sizes[groupKey].totalSamples += sample_count
      }
      console.log('bs_group_sizes', bs_group_sizes)

      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const groupKey = `${info.avg_size}`
        const sample_count = sizes.length
        if (!(groupKey in avg_group_sizes)) {
          avg_group_sizes[groupKey] = {fishes: [], totalSamples: 0}
        }
        avg_group_sizes[groupKey].fishes.push(ik)
        avg_group_sizes[groupKey].totalSamples += sample_count
      }
      console.log('avg_group_sizes', avg_group_sizes)

      const bs_groups = {}
      const avg_groups = {}

      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const bs_groupKey = `${info.BaseSize}_${info.FishVarySize}`
        const bs_group = bs_group_sizes[bs_groupKey]
        if (bs_group.fishes.length > 1 && bs_group.totalSamples > 1500) {
          const groupName = bs_group.fishes.join("+")
          //console.log('filling group', groupName)
          if (!(groupName in bs_groups)) {
            bs_groups[groupName] = { 
              sizes: [], 
              info: {BaseSize: info.BaseSize, FishVarySize: info.FishVarySize}
            }
          }
          for (const size of sizes) bs_groups[groupName].sizes.push(size)
        }

        const avg_groupKey = `${info.avg_size}`
        const avg_group = avg_group_sizes[avg_groupKey]
        if (avg_group.fishes.length > 1 && avg_group.totalSamples > 1500) {
          const groupName = avg_group.fishes.join("+")
          if (groupName in bs_groups) continue
          //console.log('filling group', groupName)
          if (!(groupName in avg_groups)) {
            avg_groups[groupName] = { 
              sizes: [], 
              info: {BaseSize: 'x', FishVarySize: 'x', avg_size: info.avg_size}
            }
          }
          for (const size of sizes) avg_groups[groupName].sizes.push(size)
        }
      }

      for (const [fishList, group] of Object.entries(bs_groups)) {
        const name = `by BS/FVS (${fishList})`
        this.alldata[name] = group.sizes
        this.fish_info[name] = group.info
      }
      for (const [fishList, group] of Object.entries(avg_groups)) {
        const name = `by AVG (${fishList})`
        this.alldata[name] = group.sizes
        this.fish_info[name] = group.info
      }

      // TODO: scan all data, group by AvgSize and highlight with same
      
      console.log('fetchObservations took', Date.now()-start, 'ms')
    },

    activate(ik) {
      this.selectedFish = ik
    },

    get_fish_info(ik) {
      const ret = ik in this.fish_info ? this.fish_info[ik] : {"BaseSize": 1, "FishVarySize": 1}
      if ('avg_size' in ret) return ret
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

      <input type="checkbox" v-model="mode_relative">relative sizes (scaled to Avg=
      <input type="number" v-model="relative_base" step="10" style="width: 3.5em;">
      )
      <br/>

      <table>
        <tr>
          <th>ik</th>
          <th>BS</th>
          <th>FVS</th>
          <th>Avg</th>
          <th>data</th>
        </tr>
        <template v-for="sizes, ik in alldata">
          <tr v-if="sizes.length > 800">
            <td>
              <template v-if="ik.startsWith('by')">
                <abbr class="tooltip" :title="ik">group</abbr>
              </template>
              <template v-else>
                {{ ik }}
              </template>
            </td>
            <td>
              {{ get_fish_info(ik).BaseSize }}
            </td>
            <td>
              {{ get_fish_info(ik).FishVarySize }}
            </td>
            <td>
              {{ get_fish_info(ik).avg_size }}
            </td>
            <td>
              <button
                :class="{ pressed: ik === selectedFish }"
                @click="activate(ik)"
              >
                {{ sizes.length }}
              </button>
            </td>
          </tr>
        </template>
      </table>
    </div>

    <div id="content">

      <details>
        <summary>Dataset: 
          size N = {{ stats.len }},
          mean M = {{ formatFixed(stats.mean, 3) }}±{{ formatFixed(1.96 * stats.meanErr, 3) }},
          min = {{ formatFixed(stats.min, 3) }},
          max = {{ formatFixed(stats.max, 3) }}
        </summary>

        <div>
          <table>
            <tr v-for="vs, group in weightedDataset.grouped">
              <td v-for="v in vs">{{ formatFixed(v, 3) }}</td>
            </tr>
          </table>
        </div>
      </details>

      <div>
        <FishModel 
          :stats="stats" 
          :histogram="histogram"
          :avg_size="mode_relative ? relative_base : fish_info[selectedFish].avg_size"
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
  left: 250px;
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