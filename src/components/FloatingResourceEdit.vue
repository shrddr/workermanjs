<script>
import {useUserStore} from '../stores/user.js'
import {useGameStore} from '../stores/game.js'
import {formatFixed, searchSorted} from '../util.js'

import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart, ScatterChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent,
  MarkAreaComponent,
} from "echarts/components";
import VChart, { THEME_KEY } from "vue-echarts";
import { ref, defineComponent } from "vue";

use([
  CanvasRenderer,
  LineChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent,
  MarkAreaComponent,
]);

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore }
  },

  components: {
    VChart,
  },

  props: {
    rgk: Number,
    workload: Number,
    wspd: Number,
    show: {
      type: Boolean,
      default: false
    }
  },

  data: () => ({
    //rawModHist: "0,0,0.5",
    //rawModHist: "0.3,0.4,0.5",
    //rawModHist: "0.0,0.0,0.0,0.6,0.1,12.4,27.9,2.1,2.9,0.0,1.2,26.6,1.4,0.6,0.0,2.2,0.2,30.1,18.6,0.5,12.4,2.1,23.8,1.8,53.4,2.1,6.8,0.9,8.9,1.7,1.8,1.3,2.2,1.5,6.6,7.9,1.8,1.7,2.5,12.6,1.3,0.3,3.0,35.1,7.2,0.0,3.1,51.0,2.8,2.2,16.8,1.2,1.4,25.8,1.4,0.0,10.5,31.5,0.0,25.2,0.4,0.7,2.6,2.3,16.8,9.1,0.0,2.5,27.7,7.2,0.0,31.2,2.4,0.0,2.6,2.2,2.0,1.5,0.8,1.9,0.3,0.0,0.0,3.1,14.6,0.0,1.3,14.7,12.4,0.8,0.0,0.0,0.6,0.5,2.2,0.8,2.2,27.0,0.6,2.4",
  }),

  computed: {
    modHist() {
      if (!this.userStore.regionResources2.hasOwnProperty(this.rgk)) {
        this.userStore.regionResources2[this.rgk] = [0]
      }
      // [0, 50, 0] -> [50, 0, 0]
      const sorted = this.userStore.regionResources2[this.rgk]
        //.split(',')
        .map(Number)
        .filter(v => !isNaN(v))
        .sort((a,b)=>b-a)
      //console.log('modHist', sorted)
      return sorted
    },
    modTimes() {
      // [50, 0, 0] resource -> {50 mod: 33% time, 0 mod: 100% time}
      const size = this.modHist.length
      const times = {}
      for (let i=0; i<this.modHist.length; i++) {
        const mod = this.modHist[i]
        times[mod] = 100 * (i+1) / (size)
      }
      //console.log('modTimes', times)
      return times
    },
    modSorted() {
      const ret = Object.keys(this.modTimes).map(Number).sort((a,b)=>a-b)
      //console.log('modSorted', ret)
      return ret
    },
    medianResource() {
      let mod = 0
      const pos = this.modHist.length
      if (pos % 2) {
        mod = modHist[(pos-1)/2]
      }
      else {
        const modA = this.modHist[(pos-1-1)/2]
        const modB = this.modHist[(pos-1+1)/2]
        mod = (modA+modB)/2
      }
      console.log('medianResource', pos, mod)
      return this.workload * (2 - mod/100)
    },
    tierResources() {
      const ret = []
      let prev_tier_chance = 0
      const wld_lo = this.workload
      const wld_hi = 2 * wld_lo
      const tier_best = Math.ceil(wld_lo / this.wspd)  // tier = number of 10-minute chunks
      const tier_worst = Math.ceil(wld_hi / this.wspd)
      for (let tier = tier_best; tier <= tier_worst; tier++) {
        //wspd * tier = activewld = wld * (2 - mod)
        const mod = Math.max(2 - this.wspd * tier / wld_lo, 0)
        const wld = wld_lo * (2 - mod)
        const chance = this.userStore.chanceAtResource(this.rgk, mod*100)
        //console.log(`w=${wld.toFixed(2)}, mod=${mod.toFixed(3)} → tier=${tier}, chance=${chance}`)
        const slice = chance - prev_tier_chance
        //if (slice == 0) continue
        ret.push({wld, mod, tier, time: slice})
        prev_tier_chance = chance
      }
      return ret
    },
    chartDataLine() {
      const ret = []
      for (let i=0; i<1001; i++) {
        const mod = i/10.0
        const awld = this.workload * (2 - mod/100)
        const chance = this.userStore.chanceAtResource(this.rgk, mod)
        const tier = awld / this.wspd
        ret.push([mod, awld, chance, tier])
      }
      //console.log('chartData', ret)
      return ret
    },
    chartDataPoints() {
      const ret = []
      if (this.userStore.modHists[this.rgk] == undefined) {
        return ret
      }
      const size = this.userStore.modHists[this.rgk].length
      for (let i=0; i<size; i++) {
        const mod = this.userStore.modHists[this.rgk][i]
        const time = 100 * i / (size-1)
        ret.push([time, mod])
      }
      //console.log('chartDataPoints', ret)
      return ret
    },
    chartColorRanges() {
      const ret = []
      let best_limit = 100
      for (const row of this.tierResources) {
        const worst_limit = row.mod*100
        ret.push({
          lte: best_limit,
          gt: worst_limit,
        })
        best_limit = worst_limit
      }
      //console.log('chartColorRanges', ret)
      return ret
    },
    chartColorRangesWorkload() {
      const ret = []
      let best_limit = this.workload
      for (const row of this.tierResources) {
        const worst_limit = row.wld
        ret.push({
          gt: best_limit,
          lte: worst_limit,
        })
        best_limit = worst_limit
      }
      //console.log('chartColorRanges', ret)
      return ret
    },
    chartBands() {
      const ret = []
      let high_limit = 100
      for (const row of this.tierResources) {
        const low_limit = row.mod * 100
        ret.push([
          {
            name: row.tier,
            xAxis: high_limit
          },
          {
            xAxis: low_limit
          }
        ])
        high_limit = low_limit
      }
      console.log('chartBands', ret)
      return ret
    },
    chartOptionRotated() {
      return {
        grid: { left: 30, top: 30, right: 30, bottom: 40 },
        xAxis: [
          {
            name: 'workload',
            nameGap: 22,
            //inverse: true,
            //scale: true,
            min: 'dataMin',
            max: 'dataMax',
            nameLocation: 'center',
            splitLine: {
              show: false
            },
            boundaryGap: ['10%', '10%'],
          },
        ],
        yAxis: {
          name: 'chance',
          //nameLocation: 'center',
          nameGap: 10,
          type: 'value',
          axisLine: {
            onZero: false,
          },
          axisLabel: {
            //formatter: "{value}%"
          },
          splitLine: {
            show: false,
          },
          axisPointer: {
            snap: true,
          },
        },
        legend: {
          show: true,
        },
        series: [
        {
            data: this.chartDataLine,
            encode: { 
              y: 2, x: 0, 
              tooltip: [0, 1, 2]
            },
            type: 'line',
            showSymbol: false,
          },
          {
            data: this.chartDataPoints,
            encode: { 
              y: 0, x: 1
            },
            type: 'scatter',
            symbolSize: 5,
            color: 'gray',
          },
        ],
        visualMap: {
          show: false,
          seriesIndex: 0,
          dimension: 0,
          pieces: this.chartColorRanges,
          color: ['#cc3', '#c22']
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            //type: 'cross',
            //snap: false,
            //axis: 'y',
          },
          formatter: function(p) {
            const mod = p[0].value[0]
            const wld = p[0].value[1]
            const chance = p[0].value[2]
            const minutes = p[0].value[3]
            return `${minutes*10} minute tier<br/>`+
              `workload ≤ ${wld.toFixed(1)}<br/>`+
              `resource ≥ ${mod.toFixed(1)}<br/>`+
              `chance ${chance.toFixed(1)}%`
          },
        },
        legend: {
          show: false,
        }
      }
    },
    chartOption() {
      return {
        /*title: {
          text: 'distribution',
          x: 'center',
        },*/
        grid: { left: 30, top: 30, right: 30, bottom: 40 },
        xAxis: {
          name: 'chance %',
          nameLocation: 'center',
          nameGap: 22,
          type: 'value',
          min: 0,
          max: 100,
          axisLine: {
            onZero: false,
          },
          axisLabel: {
            //formatter: "{value}%"
          },
          splitLine: {
            show: false,
          },
          axisPointer: {
            snap: true,
          },
        },
        yAxis: [
          {
            name: 'resource',
            nameGap: 10,
            //inverse: true,
            //scale: true,
            min: 'dataMin',
            max: 'dataMax',
            //nameLocation: 'center',
            splitLine: {
              show: false
            },
            //boundaryGap: ['10%', '10%'],
          },
        ],
        legend: {
          //show: true,
        },
        series: [
          {
            data: this.chartDataLine,
            encode: { 
              x: 2, y: 0, 
              tooltip: [0, 1, 2]
            },
            type: 'line',
            showSymbol: false,
          },
          {
            data: this.chartDataPoints,
            encode: { 
              x: 0, y: 1
            },
            type: 'scatter',
            symbolSize: 5,
            color: 'gray',
            
            tooltip: {
              show: false,
            }
          },
        ],
        visualMap: {
          show: false,
          seriesIndex: 0,
          dimension: 0,
          pieces: this.chartColorRanges,
          color: ['#cc3', '#c22']
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            //type: 'cross',
            //snap: false,
            axis: 'x',
          },
          formatter: function(p) {
            const mod = p[0].value[0]
            const wld = p[0].value[1]
            const chance = p[0].value[2]
            const tier = p[0].value[3]
            return `${formatFixed(chance, 1)}% chance to get<br/>${formatFixed(mod, 1)} or more resource, or<br/>${formatFixed(wld, 1)} or less workload, or<br/>${formatFixed(tier*10, 1)} min → ${Math.ceil(tier)*10} min cycle`
          },
          textStyle: {
            fontSize: 11,
          },
        },
        legend: {
          show: false,
        }
      }
    },
  },


  methods: {
    formatFixed,
    updStore(str) {
      //console.log('upd', str)
      this.userStore.regionResources2[this.rgk] = str.split(',')
    },
    
    spaceSep(millions, forceSign) {
      return formatFixed(millions * 1E6, 0, forceSign).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    },

  },
}
</script>

<template>
  Observations:
  <abbr class="tooltip" title="Enter comma-separated resource values (0..100 range) observed evenly across all worker-active time.
The order does not matter, but repeat occurence of same value does.
You can sneak in newlines and comments like `evening,0,0.1,2, morning,3,22,0` - text will be stored, but ignored in calculations.">ℹ</abbr><br/>
  <textarea 
    :value="this.userStore.regionResources2[this.rgk]"
    @input="event => updStore(event.target.value)" 
    class="multiline">
  </textarea>
  <div>
    <v-chart class="chart hmid" :option="chartOption" />
  </div>
  <span style="line-height: 200%;">Breakpoints:</span>
  <table class="fsxs tar">
    <tr>
      <th>work time</th>
      <td v-for="r in tierResources.filter(r => r.time)">{{ 10 * r.tier }} min</td>
    </tr>
    <tr>
      <th>workload ≤</th>
      <td v-for="r in tierResources.filter(r => r.time)">{{ formatFixed(r.wld, 2) }}</td>
    </tr>
    <tr>
      <th>resource ≥</th>
      <td v-for="r in tierResources.filter(r => r.time)">{{ formatFixed(100 * r.mod, 2) }}</td>
    </tr>
    <tr>
      <th>chance</th>
      <td v-for="r in tierResources.filter(r => r.time)">{{ formatFixed(r.time, 2) }}%</td>
    </tr>
  </table>

</template>

<style scoped>
.chart {
  height: 250px;
  width: 300px;
}
.multiline {
  width: 100%;
  height: 5em;
}
.hmid {
  margin-left: auto;
  margin-right: auto;
}
.tar {
  text-align: right;
}
.tooltip {
  cursor: help;
}
</style>