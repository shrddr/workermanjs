<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import { makeBinomialArray, loss } from '../../stats.js'
import binomialTest from '@stdlib/stats-binomial-test';

import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart, LineChart, ScatterChart, CustomChart } from "echarts/charts";
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
  CustomChart,
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
    sweep_lo: 0,
    sweep_hi: 1,
  }),
  props: {
    stats: Object,
    histogram: Object,
  },
  components: {
    VChart,
  },
  methods: {
    isGoodVal,
    formatFixed,
    formatKMG,
    makeBinomialArray,
    loss,

    makeModelB(np, n) {
      const bell = this.makeBinomialArray(np, this.stats.lucky.len, n)
      if (!bell) return null
      const model = {np, n, bell}
      const histMap = this.histogram.map
      
      // bin0 used in loss calculation only if outside error bar
      const bin0min = this.histogramLuckOnly.err[0][1]
      const bin0max = this.histogramLuckOnly.err[0][2]
      if (bell[0] < bin0min) {
        const newMap = { ...histMap }
        newMap[0] = bin0min
        model.loss = this.loss(model.bell, newMap, 2, false)
      }
      else {
        if (bell[0] > bin0max) {
          const newMap = { ...histMap }
          newMap[0] = bin0max
          model.loss = this.loss(model.bell, newMap, 2, false)
        }
        else {
          const newMap = { ...histMap }
          delete newMap[0]
          model.loss = this.loss(model.bell, newMap, 2, false, true)
        }
      }

      const isBinary = 0 in bell && 1 in bell && Object.keys(bell).length == 2 && 0 in histMap && 1 in histMap && Object.keys(histMap).length == 2
      if (isBinary) {
        const total = this.stats.lucky.len
        const y1_expected = bell[1][1]
        const y1_observed = histMap[1]
        const probability = y1_expected/total
        if (y1_observed <= total && 0 < probability && probability < 1) {
          model.loss.binomtest = binomialTest( y1_observed, Math.round(total), {p: probability} )
          model.loss.pval = model.loss.binomtest.pValue
          console.log('binomtest:', bell, histMap, y1_observed, total, probability, model.loss.binomtest)
        }
        else {
          console.log("can't binomtest", bell, histMap, y1_observed, total, probability)
          model.loss.binomtest = NaN
        }
      }

      return model
    },

    tuneModelB(np, n) {
      // if nL specified, just creates a model
      // if not specified, sweeps to find best nL
      
      let n_candidates = [n]
      if (n === undefined) {
        n_candidates = [10, 20, 40, 110, 120, 140, 150]
        n_candidates.push(this.stats.max)
        n_candidates = n_candidates.filter((n) => (n <= this.stats.max * 5))
      }

      let best_model = {np: 0, n: 1, loss: {mse: undefined, chisq: undefined, pval: undefined}}

      if (!this.histogramLuckOnly) {
        console.log('tuneModelB skip')
        return
      }
      
      n_candidates.forEach((n) => {
        const model = this.makeModelB(np, n)
        if (!model) return
        //const better_pval = (model.loss.pval && best_model.loss.pval) && (model.loss.pval > best_model.loss.pval)
        //const better_chisq = (model.loss.chisq && best_model.loss.chisq) && (model.loss.chisq < 0.9999 * best_model.loss.chisq)
        const better_mse = isGoodVal(model.loss.mse) && (!isGoodVal(best_model.loss.mse) || model.loss.mse < best_model.loss.mse)
        if (better_mse) {
          //console.log('new best model', best_chisq)
          best_model = model
        }

      })
      if (best_model && best_model.np > 0 && best_model.np <= best_model.n) {
        //console.log(`tuneModelB np ${np} -> n ${best_model.n} chisq ${best_model.loss.chisq}`)
        return best_model
      }
      else {
        console.log(`tuneModelB np=${np} -> failed`)
        return null
      }
    },

    applySelectedNp(val) {
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
    histogramLuckOnly() {
      // for display
      const newMap = { ...this.histogram.map }
      newMap[0] = this.histogram.map[0] - this.stats.unlucky.len
      const newArr = []
      const newArrErr = []
      for (const [k, v] of Object.entries(newMap)) {
        if (k == 0) {
          const bin0_hi = this.histogram.map[0] - (this.stats.len - this.stats.lucky.lenHi)
          const bin0_lo = this.histogram.map[0] - (this.stats.len - this.stats.lucky.lenLo)
          newArrErr.push([k, bin0_lo, bin0_hi])
        }
        newArr.push([k, v])
      }
      return { map: newMap, arr: newArr, err: newArrErr }
    },

    zeroBinRange() {
      const ret = {
        min: this.histogramLuckOnly.err[0][1],
        max: this.histogramLuckOnly.err[0][2],
      }
      return ret
    },

    npRangeForBinary() {
      if (Object.keys(this.histogram.map).length == 2) {
        if (1 in this.histogram.map) {
          const vol1 = this.histogram.map[1]
          return {
            min: vol1 / (this.zeroBinRange.max + vol1),
            max: vol1 / (this.zeroBinRange.min + vol1),
          }
        }
      }
    },

    modelB() {
      const model = this.makeModelB(this.selected_np, this.selected_n)
      console.log('modelB', model)
      return model
    },

    modelBForChart() {
      const samples = this.stats.len
      const z = this.stats.generalSigmas
      const modelForChart = []
      this.modelB.bell.forEach(([k, v]) => {
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

    modelBSweep() {
      // meanLo/share...meanHi/share is too narrow
      // meanLo/shareHi...meanHi/shareLo is too wide
      // after multiplication of two normal random distributions with µ1±σ1, µ2±σ2
      // σ = sqrt(µ1²σ2²+µ2²σ1²+σ1²σ2²)
      // we have division though
      const lo = Math.max(this.stats.meanLo / this.stats.lucky.share, 0)

      if (lo > 8888888) {
        console.log('modelBSweep skip - no input', this.stats.meanLo, this.stats.lucky.share, this.stats.lucky.std)
        return false
      }

      this.sweep_lo = lo
      this.sweep_hi = this.stats.meanHi / this.stats.lucky.share

      const range = this.sweep_hi - lo
      let step = 10
      const possibleSteps = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
      for (const _step of possibleSteps) {
        const _stepCount = Math.floor(range / _step)
        if (_stepCount < 40) {
          step = _step
          break
        }
      }
      if (Math.floor(range / step) > 1000)
        return false
      const loRounded = Math.ceil(lo/step)*step
      let best_model = {
        np: undefined,
        n: undefined,
        loss: {mse: +Infinity, chisq: +Infinity, pval: 0}
      }
      const log = []
      for (let mu = loRounded; mu <= this.sweep_hi; mu += step) {
        // TODO: avoid discontinuities
        // - pick best N and keep it for the whole sweep 
        // - don't discard additional bins while sweeping
        const model = this.tuneModelB(mu, undefined)
        if (!model)
          continue
        log.push([
          mu,
          model.n,
          model.loss.mse, 
          model.loss.chisq, 
          model.loss.pval, 
        ])
        //const pval_valid = isGoodVal(model.loss.pval)
        //const pval_better = model.loss.pval > best_model.loss.pval || !best_model.loss.pval
        const mse_better = isGoodVal(model.loss.mse) && (!isGoodVal(best_model.loss.mse) || model.loss.mse < best_model.loss.mse)
        //const better_chisq = (model.loss.chisq < best_model.loss.chisq)
        //if ((pval_valid && pval_better) || (!pval_valid && mse_better)) {
        if (mse_better) {
          console.log('new best model', mu, model)
          best_model = model
        }
      }
      this.selected_np = best_model.np
      this.selected_n = best_model.n
      //console.log('modelBSweep', lo, this.sweep_hi, step, loRounded, best_model, log)
      return {result: best_model, log}
    },

    makeChartBSweep() {
      const chartOption = {
        legend: {},
        tooltip: {
          trigger: 'axis',
          //valueFormatter: v => formatFixed(v, 5), // somehow affects last series y and not x
          formatter: function (params) {
            const d = params[0].data 
            const s = `np=${formatFixed(d[0], 2)}<br/>`+
              `n=${formatFixed(d[1])}<br/>`+
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
          { source: this.modelBSweep.log },
        ],
        xAxis: {
          min: this.sweep_lo,
          max: this.sweep_hi,
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
              formatter: value => this.formatKMG(value)
            },
            splitLine: { show: false }
          },
          { position: "right", },
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
      console.log('makeChartBSweep', chartOption.dataset)
      return chartOption
    },

makeChartBHist() {
  const chartOption = {
    legend: null,  // hide
    //legend: {},  // show
    tooltip: {
      trigger: 'axis',
      //valueFormatter: v => v.toFixed(0)
    },
    dataset: [
      { source: this.histogramLuckOnly.arr },
      { source: this.histogramLuckOnly.err },
      { source: this.modelBForChart },
    ],
    xAxis: {
      axisLine: { onZero: false },
      min: -1,
      max: this.stats.max + 1,
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
          x: 0,
          y: 1,
          //tooltip: [2] 
        },
        tooltip: {
          valueFormatter: v => formatFixed(v, 0)
        },
      },
      
      {
        type: 'line',
        name: 'model',
        datasetIndex: 2,
        encode: { 
          x: 0,
          y: 1, 
          //tooltip: [2] 
        },
        tooltip: {
          valueFormatter: v => formatFixed(v, 3)
        },
        showSymbol: false,
      },

      {
        type: 'line',
        name: `-${this.stats.generalSigmas}σ`,
        datasetIndex: 2,
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
        datasetIndex: 2,
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

      {
        type: 'custom',
        name: 'observed-error',
        datasetIndex: 1,
        encode: {
          x: 0,
          y: [1, 2],
        },
        //color: 'gray',
        itemStyle: {
          borderWidth: 1.5
        },
        renderItem: function (params, api) {
          var xValue = api.value(0);
          var highPoint = api.coord([xValue, api.value(1)]);
          var lowPoint = api.coord([xValue, api.value(2)]);
          var halfWidth = api.size([1, 0])[0] * 0.1;
          var style = api.style({
            stroke: api.visual('color'),
            fill: undefined
          });
          return {
            type: 'group',
            children: [
              {
                type: 'line',
                transition: ['shape'],
                shape: {
                  x1: highPoint[0] - halfWidth,
                  y1: highPoint[1],
                  x2: highPoint[0] + halfWidth,
                  y2: highPoint[1]
                },
                style: style
              },
              {
                type: 'line',
                transition: ['shape'],
                shape: {
                  x1: highPoint[0],
                  y1: highPoint[1],
                  x2: lowPoint[0],
                  y2: lowPoint[1]
                },
                style: style
              },
              {
                type: 'line',
                transition: ['shape'],
                shape: {
                  x1: lowPoint[0] - halfWidth,
                  y1: lowPoint[1],
                  x2: lowPoint[0] + halfWidth,
                  y2: lowPoint[1]
                },
                style: style
              }
            ]
          };
        },
        tooltip: {
          show: false,
        },
        z: 100,
      },
    ],
  }
  //console.log('makeChartAHist', chartOption.dataset)
  return chartOption
},
  },
}

</script>

<template>
  <span class="title">Model B</span>
  <span>: majority (1-λ) of points are zero, but
  λ points are from a binomial distribution with such <i>np</i>, that
  λ<i>np</i> = M</span>

  <template v-if="modelB">
    <p>Sweeping through <i>np</i> values in
    {{ formatFixed(this.sweep_lo, 2) }}…{{ formatFixed(this.sweep_hi, 2) }}
    range:</p>
    
    <div>
      <div style="float:left;">
        <div id="chartSweep" v-if="modelBSweep">
          <v-chart :option="makeChartBSweep" />
        </div>
        <div style="padding:1em;">
          <div style="float:left;">
            <table>
              <tr><th></th><th>np</th><th>n</th><th>MSE</th><th v-if="0">χ²</th><th>p-val</th></tr>
              <tr v-if="modelBSweep.result">
                <td>Best fit:</td>
                <td>{{ formatFixed(modelBSweep.result.np, 3) }}</td>
                <td>{{ modelBSweep.result.n }}</td>
                <td>{{ formatFixed(modelBSweep.result.loss.mse, 2) }}</td>
                <td v-if="0">{{ formatFixed(modelBSweep.result.loss.chisq, 2) }}</td>
                <td>{{ formatFixed(modelBSweep.result.loss.pval, 4) }}</td>
              </tr>
              <tr>
                <td>Manual:</td>
                <td>{{ formatFixed(selected_np, 3) }}</td>
                <td>{{ selected_n }}</td>
                <td>{{ formatFixed(modelB.loss.mse, 2) }}</td>
                <td v-if="0">{{ formatFixed(modelB.loss.chisq, 2) }}</td>
                <td>{{ formatFixed(modelB.loss.pval, 4) }}</td>
              </tr>
            </table>
            <p>
              npᴸ: <input type="range" @input="event => applySelectedNp(Number(event.target.value))" :value="selected_np" :min="stats.min" :max="sweep_hi * 1.5" :step="0.01" class="vmid">
              nᴸ: <input type="range" @input="event => applySelectedN(Number(event.target.value))" :value="selected_n" :min="1" :max="200" :step="1" class="vmid">
            </p>
          </div>
          <div style="clear:both;"></div>
        </div>
      </div>

      <div v-if="modelB.bell" style="float: left;">
        <div id="chartHisto">
          <v-chart :option="makeChartBHist" />
        </div>
        <div>
          Bin 0 has 1-λ ≈ {{ formatFixed(stats.unlucky.len) }} samples removed, {{ formatFixed(histogramLuckOnly.arr[0][1]) }} remaining<br/>
          Depending on actual λ could potentially be {{ formatFixed(histogramLuckOnly.err[0][1]) }}…{{ formatFixed(histogramLuckOnly.err[0][2]) }} remaining
          <p v-if="npRangeForBinary">
            Corresponding range for <i>np</i>: {{ formatFixed(npRangeForBinary.min, 3) }}…{{ formatFixed(npRangeForBinary.max, 3) }}
          </p>
        </div>
      </div>
      <div v-else>
        bad parameters
      </div>
      
      <div style="clear:both;"></div>
    </div>

    <div>
      <p class="fsxs">MSE: <i>Σ (observed - model)²</i>, discard nothing ← this is used for fitting</p>
      <template v-if="npRangeForBinary">
        <p class="fsxs">p-val: <a href="https://en.wikipedia.org/wiki/Binomial_test">exact</a></p>
      </template>
      <template v-else>
        <p class="fsxs">χ²: discard bins where model &lt; 3, then <i>Σ (observed - model)² / model</i></p>
        <p class="fsxs">p-val: <i>1 - chisquare.cdf(χ², bins - 1 - dof) ← this depends too much on previous step discards</i></p>
      </template>
      
    </div>
  </template>
</template>

<style scoped>
#chartSweep {
  width: 270px;
  height: 170px;
}
#chartHisto {
  width: 500px;
  height: 320px;
}
</style>
