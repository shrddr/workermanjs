<script>
import { formatFixed, isNumber } from '../util.js'
import FishModel from '../components/droprateModels/FishModel.vue'
import FishRollModel from '../components/droprateModels/FishRollModel.vue'
import VariableFishRollModel from '../components/droprateModels/VariableFishRollModel.vue'

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
    FishRollModel,
    VariableFishRollModel,
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
      mode_unsquare: true,
      relative_base: 100,

      alldata: {},
      selectedFish: 'ALL',
      selectedLuck: 68.3,
      generalSigmas: 4,
      modelTab: 'rolls',
      rollModelTab: 'variable',
      unconditionalVariableRolls: 2,

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
          let size = v
          if (this.relativeSizesActive) {
            const relativeSize = v / info.avg_size
            size = this.relative_base * (
              this.mode_unsquare ? Math.sqrt(relativeSize) : relativeSize
            )
          }
          ret.push(size)
        }

      }
      return ret
    },

    currentAvgSize() {
      const avgSize = this.relativeSizesActive
        ? Number(this.relative_base)
        : this.get_fish_info(this.selectedFish).avg_size
      return avgSize
    },

    relativeSizesActive() {
      return this.selectedFish === 'ALL' || this.mode_relative
    },

    menuEntries() {
      const section = key => {
        if (key === 'ALL') return 0
        if (key.startsWith('by ')) return 1
        return 2
      }

      return Object.entries(this.alldata).sort(([keyA], [keyB]) => {
        const sectionDifference = section(keyA) - section(keyB)
        if (sectionDifference !== 0) return sectionDifference
        return keyA.localeCompare(keyB, undefined, { numeric: true })
      })
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

      let totalLuckyLen = 0
      let minLuck = 100
      let maxLuck = 0
      
      minLuck = Math.min(minLuck, this.selectedLuck)
      maxLuck = Math.max(maxLuck, this.selectedLuck)
      let {len, luckyLen, sorted, weights, grouped} = dataByLuck
      totalLuckyLen += luckyLen
      const dataFlatSorted = sorted
      const weightsFlat = weights
      

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

    async fetchObservations() {
      const start = Date.now()
      this.alldata = await (await fetch(`data/manual/catches_by_fish.json`)).json()
      this.fish_info = await (await fetch(`data/encyclopedia.json`)).json()

      {
        console.log('filling group ALL')
        const all = []
        
        for (const [ik, sizes] of Object.entries(this.alldata)) {
          const info = this.get_fish_info(ik)
          const avg_size = (info.baseSize + info.varySize) / 2
          for (const v of sizes) all.push(this.relative_base * v / avg_size)
        }
        this.alldata['ALL'] = all
        this.fish_info['ALL'] = {baseSize: 'x', varySize: 'x', avg_size: this.relative_base}
      }

      const bs_group_sizes = {}
      const avg_group_sizes = {}

      for (const [ik, sizes] of Object.entries(this.alldata)) {
        const info = this.get_fish_info(ik)
        const groupKey = `${info.baseSize}_${info.varySize}`
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
        const bs_groupKey = `${info.baseSize}_${info.varySize}`
        const bs_group = bs_group_sizes[bs_groupKey]
        if (bs_group.fishes.length > 1 && bs_group.totalSamples > 1500) {
          const groupName = bs_group.fishes.join("+")
          //console.log('filling group', groupName)
          if (!(groupName in bs_groups)) {
            bs_groups[groupName] = { 
              sizes: [], 
              info: {baseSize: info.baseSize, varySize: info.varySize}
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
              info: {baseSize: 'x', varySize: 'x', avg_size: info.avg_size}
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
      
      //console.log(this.fish_info)
      console.log('fetchObservations took', Date.now()-start, 'ms')
    },

    activate(ik) {
      this.selectedFish = ik
      if (ik === 'ALL') this.mode_relative = true
    },

    downloadCurrentDataset() {
      const json = JSON.stringify(this.currentDataset)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const fishName = this.selectedFish
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^_+|_+$/g, '') || 'dataset'
      const link = document.createElement('a')

      link.href = url
      link.download = `${fishName}_filtered.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },

    get_fish_info(ik) {
      const ret = ik in this.fish_info ? this.fish_info[ik] : {"baseSize": 1, "varySize": 1}
      if ('avg_size' in ret) return ret
      ret.avg_size = (ret.baseSize + ret.varySize) / 2
      return ret
    },
  }
}
</script>

<template>
  <main>
    <div id="menu">
      <div style="display: none;">{{ selectedFish }}</div>

      <table>
        <tr>
          <th>ik</th>
          <th>BS</th>
          <th>FVS</th>
          <th>Avg</th>
          <th>data</th>
        </tr>
        <template v-for="[ik, sizes] in menuEntries" :key="ik">
          <tr v-if="sizes.length > 100">
            <td>
              <template v-if="ik.startsWith('by')">
                <abbr class="tooltip" :title="ik">group</abbr>
              </template>
              <template v-else>
                {{ ik }}
              </template>
            </td>
            <td>
              {{ get_fish_info(ik).baseSize }}
            </td>
            <td>
              {{ get_fish_info(ik).varySize }}
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
      <div id="settings">
        <label>
          <input
            type="checkbox"
            :checked="relativeSizesActive"
            :disabled="selectedFish === 'ALL'"
            @change="mode_relative = $event.target.checked"
          >
          unscale to Avg=
        </label>
        <input type="number" v-model="relative_base" step="10" class="w5em">
        <br/>
        <label>
          <input
            type="checkbox"
            :checked="relativeSizesActive && mode_unsquare"
            :disabled="!relativeSizesActive"
            @change="mode_unsquare = $event.target.checked"
          >
          unsquare (take square root)
        </label>
      </div>

      <details>
        <summary>Dataset: 
          size N = {{ stats.len }},
          mean M = {{ formatFixed(stats.mean, 3) }}±{{ formatFixed(1.96 * stats.meanErr, 3) }},
          min = {{ formatFixed(stats.min, 3) }},
          max = {{ formatFixed(stats.max, 3) }}
          (<a href="#" @click.prevent="downloadCurrentDataset">download</a>)
        </summary>

        <table v-if="currentDataset.length <= 10000">
          <tr v-for="vs, group in weightedDataset.grouped">
            <td v-for="v in vs">{{ formatFixed(v, 3) }}</td>
          </tr>
        </table>
        <p v-else>
          your browser will not handle this
        </p>

      </details>

      <div>
        <div class="tabs">
          <button
            :class="{ pressed: modelTab === 'rolls' }"
            @click="modelTab = 'rolls'"
          >
            multiple rolls
          </button>
          <button
            :class="{ pressed: modelTab === 'sum' }"
            @click="modelTab = 'sum'"
          >
            sum of distributions
          </button>
        </div>

        <div v-show="modelTab === 'rolls'">
          <div class="tabs roll-tabs">
            <span>number of rolls </span>
            <button
              :class="{ pressed: rollModelTab === 'variable' }"
              @click="rollModelTab = 'variable'"
            >
              variable
            </button>
            <button
              :class="{ pressed: rollModelTab === 'fixed' }"
              @click="rollModelTab = 'fixed'"
            >
              fixed
            </button>
          </div>

          <div v-show="rollModelTab === 'variable'">
            <div class="variable-roll-options">
              <label>
                unconditional rolls
                <input
                  v-model.number="unconditionalVariableRolls"
                  type="number"
                  min="0"
                  max="5"
                  step="1"
                  @change="unconditionalVariableRolls = Math.min(5, Math.max(0, Math.trunc(Number(unconditionalVariableRolls) || 0)))"
                >
              </label>
            </div>
            <VariableFishRollModel
              :unconditional-rolls="unconditionalVariableRolls"
              :stats="stats"
              :histogram="histogram"
              :avg_size="currentAvgSize"
              :mode_relative="relativeSizesActive"
            />
          </div>

          <div v-show="rollModelTab === 'fixed'">
            <FishRollModel
              :stats="stats"
              :histogram="histogram"
              :avg_size="currentAvgSize"
              :mode_relative="relativeSizesActive"
            />
          </div>
        </div>
        <div v-show="modelTab === 'sum'">
          <FishModel
            :stats="stats" 
            :histogram="histogram"
            :avg_size="currentAvgSize"
            :mode_relative="relativeSizesActive"
          />
        </div>
      </div>

    </div>
  </main>
</template>

<style scoped>
#menu {
  position: fixed;
  box-sizing: border-box;
  width: 250px;
  height: 90vh;
  overflow-y: auto;
  z-index: 1;
  background: var(--color-background);
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

.tooltip {
  cursor: help;
}

.tabs {
  margin-top: 1em;
}

.roll-tabs {
  margin-top: 0.25em;
}

.variable-roll-options {
  margin-top: 0.25em;
}

.variable-roll-options input {
  width: 3em;
}
</style>
