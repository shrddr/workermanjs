<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import { makeBinomialArray, loss, applyGiantBonus } from '../../stats.js'
import binomialTest from '@stdlib/stats-binomial-test';

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
import VChart from "vue-echarts";

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
  data: () => ({
    selected_np: 1,
    selected_n: 10,
    isBinary: false,
  }),
  props: {
    stats: Object,
    histogram: Object,
    isGiant: Boolean,
  },
  components: {
    VChart,
  },
  methods: {
    formatFixed,
    isGoodVal,
    formatKMG,
    makeBinomialArray,
    loss,
    applyGiantBonus,

    makeModelA(np, n) {
      let model = {np, n}
      model.bell = this.makeBinomialArray(np, this.stats.len, n, this.isGiant)
      //console.log('makeModelA', model.bell)
      if (!model.bell) return null
      model.loss = this.loss(model.bell, this.histogram.map, 2)

      this.isBinary = 0 in model.bell && 1 in model.bell && Object.keys(model.bell).length == 2 && 0 in this.histogram.map && 1 in this.histogram.map && Object.keys(this.histogram.map).length == 2
      if (this.isBinary) {
        const total = this.stats.lucky.len
        const y1_expected = model.bell[1][1]
        const y1_observed = this.histogram.map[1]
        const probability = y1_expected/total
        if (y1_observed <= total && 0 < probability && probability < 1) {
          model.loss.binomtest = binomialTest( y1_observed, Math.round(total), {p: probability} )
          model.loss.pval = model.loss.binomtest.pValue
          console.log('binomtest:', model.bell, this.histogram.map, y1_observed, total, probability, model.loss.binomtest)
        }
        else {
          console.log("can't binomtest", model.bell, this.histogram.map, y1_observed, total, probability)
          model.loss.binomtest = NaN
        }
      }

      return model
    },

    tuneModelA(np, n, minN) {
      // if n specified, just creates a model
      // if not specified, brute forces the best n and sets it
      let n_candidates = [n]
      if (n === undefined) {
        n_candidates = [1, 10, 20, 40, 110, 120, 140, 150]
        n_candidates = n_candidates.filter((n) => (n >= np && n <= this.stats.max * 5))
        if (minN) n_candidates.push(minN)
        //n_candidates.push(this.stats.max)
        //console.log('makeModelA candidates', n_candidates)
      }

      let best_model = {n: NaN, loss: {mse: NaN, chisq: NaN, pval: NaN}}
      
      n_candidates.forEach((n) => {
        const model = this.makeModelA(np, n)
        if (!model) return
        //const better_pval = isGoodVal(model.loss.pval) && (!isGoodVal(best_model.loss.pval) || model.loss.pval > best_model.loss.pval)
        //const better_chisq = isGoodVal(model.loss.chisq) && (!isGoodVal(best_model.loss.chisq) || model.loss.chisq < best_model.loss.chisq)
        const better_mse = isGoodVal(model.loss.mse) && (!isGoodVal(best_model.loss.mse) || model.loss.mse < best_model.loss.mse)
        if (better_mse) {
          //console.log('new best model', better_pval, better_chisq)
          best_model = model
        }
      })
      return best_model
    },

    applySelectedNP(val) {
      if (val < 0) return
      if (val > this.selected_n)
        this.selected_n = Math.ceil(val)
      this.selected_np = val
    },
    applySelectedN(val) {
      if (val < 0) return
      if (val < this.selected_np)
        this.selected_np = val
      this.selected_n = val
      //console.log('applySelectedN', this.selected_n)
    },
  },
  computed: {
    modelA() {
      //console.log('modelA from', this.selected_np, this.selected_n)
      const model = this.makeModelA(this.selected_np, this.selected_n)
      //console.log('modelA', model)
      return model
    },

    modelAForChart() {
      const samples = this.stats.len
      const z = this.stats.generalSigmas
      const modelForChart = []
      this.modelA.bell.forEach(([k, v]) => {
        const probability = v / samples
        const interval = z * Math.sqrt(probability * (1 - probability) / samples)
        const lo = Math.max(0, probability - interval) * samples
        const hi = Math.min(1, probability + interval) * samples
        modelForChart.push([
          k,
          v,
          lo,
          hi,
        ])
      })
      //console.log('modelForChart', modelForChart)
      return modelForChart
    },

    sweepRange() {
      const ret = {
        lo: Math.max(0, this.stats.meanLo),
        init: this.stats.mean,
        hi: this.stats.meanHi,
      }
      if (this.isGiant) {
        if (ret.init > 40) {
          ret.lo /= 1.684
          ret.init /= 1.684
          ret.hi /= 1.684
        }
        else if (ret.init > 20) {
          ret.lo /= 1.684
          ret.init /= 1.684
          ret.hi /= 1.6
        }
        else if (ret.init > 10) {
          ret.lo /= 1.684
          ret.init /= 1.684
          ret.hi /= 1.5
        }
        else if (ret.init > 5) {
          ret.lo /= 1.684
          ret.init /= 1.684
          ret.hi /= 1.3
        }
        else if (ret.init > 1) {
          ret.lo /= 1.684
          ret.init /= 1.684
          ret.hi /= 1.0
        }
      }
      ret.range = ret.hi - ret.lo
      return ret
    },

    modelASweep() {
      const initModel = this.tuneModelA(this.sweepRange.init, undefined)

      let step = 10
      const possibleSteps = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
      for (const _step of possibleSteps) {
        const _stepCount = Math.floor(this.sweepRange.range / _step)
        if (_stepCount < 20) {
          step = _step
          break
        }
      }
      const loRounded = Math.ceil(this.sweepRange.lo/step)*step
      let best_model = initModel
      const log = []
      for (let mu = loRounded; mu <= this.sweepRange.hi; mu += step) {
        let model = this.tuneModelA(mu, undefined)
        if (mu > this.sweepRange.init && mu < this.sweepRange.init+step) {
          log.push([
            this.sweepRange.init, 
            model.n,
            initModel.loss.mse, 
            initModel.loss.chisq, 
            initModel.loss.pval,
          ])
        }
        log.push([
          mu,
          model.n,
          model.loss.mse, 
          model.loss.chisq, 
          model.loss.pval, 
        ])
        if (model.loss.mse < best_model.loss.mse) {
          best_model = model
        }
      }
      if (isFinite(best_model.loss.mse)) {
        this.selected_np = best_model.np
        this.selected_n = best_model.n
      }
      //console.log('modelASweep', step, loRounded, best_model, log)
      return {result: best_model, log}
    },

    makeChartHist() {
      const chartOption = {
        legend: null,  // hide
        //legend: {},  // show
        tooltip: {
          trigger: 'axis',
          //valueFormatter: v => v.toFixed(0)
        },
        dataset: [
          { source: this.histogram.arr },
          { source: this.modelAForChart },
        ],
        xAxis: {
          axisLine: { 
            onZero: false 
          },
          min: this.stats.min == 0 ? -1 : null,
          max: this.stats.max < 3 ? this.stats.max + 1 : null,
        },
        yAxis: { 
          axisLine: { onZero: false } ,
          axisLabel: {
            formatter: value => this.formatKMG(value)
          },
        },
        grid: { left: 35, top: 8, right: 10, bottom: 20 },
        series: [
          {
            type: 'bar',
            name: 'observed',
            datasetIndex: 0,
            encode: {
              x: 0, y: 1,
              //tooltip: [2] 
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 0)
            },
          },
          {
            type: 'line',
            name: 'model',
            datasetIndex: 1,
            encode: { 
              x: 0, y: 1,
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 0)
            },
            showSymbol: false,
          },
          {
            type: 'line',
            name: `-${this.stats.generalSigmas}σ`,
            datasetIndex: 1,
            encode: { 
              x: 0, y: 2,
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 0)
            },
            showSymbol: false,
            /*stack: 'confidence1',  // not working
            areaStyle: {
              color: '#ccc'
            },*/
            lineStyle: {
              opacity: 0.4,
            },
          },
          {
            type: 'line',
            name: `+${this.stats.generalSigmas}σ`,
            datasetIndex: 1,
            encode: { 
              x: 0, y: 3,
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 0)
            },
            showSymbol: false,
            /*stack: 'confidence1',  // not working
            areaStyle: {
              color: '#ccc'
            },*/
            lineStyle: {
              opacity: 0.4,
            },
          },
        ],
      }
      //console.log('[A] makeChartHist', chartOption.dataset)
      return chartOption
    },

    makeChartASweep() {
      const chartOption = {
        legend: {},
        tooltip: {
          trigger: 'axis',
          //valueFormatter: v => formatFixed(v, 5), // somehow affects last series y and not x
          formatter: function (params) {
            const d = params[0].data 
            const s = `np=${formatFixed(d[0], 2)}<br/>`+
              `n=${formatFixed(d[1], 2)}<br/>`+
              `MSE=${d[2].toLocaleString(undefined, { notation: "compact" })}<br/>`+
              `χ²=${d[3].toLocaleString(undefined, { notation: "compact" })}<br/>`+
              `p-val=${formatFixed(d[4], 2)}<br/>`
            return s;
          },
        },
        title: {
          subtext: '',
          left: 'center',
          textStyle: {
            fontSize: 10,
          }
        },
        dataset: [
          { source: this.modelASweep.log },
        ],
        xAxis: {
          min: this.sweepRange.lo,
          max: this.sweepRange.hi,
          name: "np",
          nameLocation: "center", nameGap: 20,
          axisLine: { onZero: false },
          //scale: true,
          axisLabel: {
            showMinLabel: false,
          },
        },
        yAxis: [
          { 
            position: 'left',
            axisLabel: {
              formatter: value => value.toLocaleString(undefined, { notation: "compact" })
            },
            splitLine: { show: false }
          },
          { 
            position: "right",
            axisLabel: {
              formatter: value => value.toLocaleString(undefined, { notation: "compact" })
            },
          },
        ],
        grid: { left: 35, top: 30, right: 40, bottom: 20 },
        series: [
          {
            name: "MSE",
            type: 'line',
            encode: { 
              x: 0, y: 2
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 2)
            },
            //lineStyle: {color: '#aaa'}
            //showSymbol: false,
          },
          {
            name: "p-val",
            type: 'line',
            encode: { 
              x: 0, y: 4 
            },
            tooltip: {
              valueFormatter: v => formatFixed(v, 4)
            },
            yAxisIndex: 1,
            //lineStyle: {color: '#aaa'}
            //showSymbol: false,
          },
        ],
      }
      console.log('makeChartASweep', chartOption.dataset)
      return chartOption
    },
  },
}

</script>

<template>
  <span class="title">Model A</span>
  <span>: all points were taken from a single distribution with <i>np = M</i></span>
  <p><input type="checkbox" v-model="isGiant"> with giant bonus</p>
  <p v-if="isGiant">This causes gaps in Unlucky distrubution because giantValue=floor(1.684*ordinaryValue);</p>
  
  <div>
    <div style="float:left;">
      Sweeping through <i>np</i> values in 
      {{ formatFixed(this.sweepRange.lo, 2) }}…{{ formatFixed(this.sweepRange.hi, 2) }}
      range:
      <div id="chartSweep" v-if="modelASweep.result.np">
        <v-chart :option="makeChartASweep" />
      </div>
      <div v-else>
        [failed]
      </div>
      <div style="padding:1em;">
        <table>
          <tr><th></th><th>np</th><th>n</th><th>MSE</th><th v-if="0">χ²</th><th>p-val</th></tr>
          <tr :class="{ strike: stats.aBad }" v-if="modelASweep.result">
            <td>Best fit:</td>
            <td>{{ formatFixed(modelASweep.result.np, 4) }}</td>
            <td>{{ formatFixed(modelASweep.result.n) }}</td>
            <td>{{ formatFixed(modelASweep.result.loss.mse, 2) }}</td>
            <td v-if="0">{{ formatFixed(modelASweep.result.loss.chisq, 2) }}</td>
            <td>{{ formatFixed(modelASweep.result.loss.pval, 4) }}</td>
          </tr>
          <tr>
            <td>Manual:</td>
            <td>{{ formatFixed(selected_np, 4) }}</td>
            <td>{{ selected_n }}</td>
            <td>{{ formatFixed(modelA.loss.mse, 2) }}</td>
            <td v-if="0">{{ formatFixed(modelA.loss.chisq, 2) }}</td>
            <td>{{ formatFixed(modelA.loss.pval, 4) }}</td>
          </tr>
        </table>
        np: <input type="range" @input="event => applySelectedNP(Number(event.target.value))" :value="selected_np" :min="stats.min" :max="stats.max" :step="0.01" class="vmid">
        n: <input type="range" @input="event => applySelectedN(Number(event.target.value))" :value="selected_n" :min="stats.max" :max="200" :step="1" class="vmid">
        <br/>
      </div>
    </div>
    
    <div id="chartHisto" style="float:left;">
      <template v-if="modelA.bell">
        <v-chart :option="makeChartHist" />
      </template>
      <template v-else>
        [failed to build the requested distribution np={{ modelA.np }} n={{ modelA.n }} ]
      </template>
    </div>


    <div style="clear:both;"></div>

    <br/>
  <p class="fsxs">MSE: <i>Σ (observed - model)²</i>, discard nothing ← this is used for fitting</p>
  <template v-if="isBinary">
    <p class="fsxs">p-val: <a href="https://en.wikipedia.org/wiki/Binomial_test">exact</a></p>
  </template>
  <template v-else>
    <p class="fsxs">χ²: discard bins where model &lt; 3, then <i>Σ (observed - model)² / model</i></p>
    <p class="fsxs">p-val: <i>1 - chisquare.cdf(χ², bins - 1 - dof) ← this depends too much on previous step discards</i></p>
  </template>

  </div>
</template>

<style scoped>
#chartSweep {
  width: 270px;
  height: 170px;
}
#chartHisto {
  float: left;
  width: 500px;
  height: 300px;
}
</style>
