<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import { makeBinomialArray, makeBinomialArraysForGiant, sumDistributions, loss, applyGiantBonus } from '../../stats.js'

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

class Grid {
  constructor() {
    this.data = {}
    this.xmin = 999
    this.xmax = -999
    this.ymin = 999
    this.ymax = -999
  }
  put(x, y, m) {
    if (!this.data.hasOwnProperty(x))
      this.data[x] = {}
    this.data[x][y] = m
    this.xmin = Math.min(this.xmin, y/10000)
    this.xmax = Math.max(this.xmax, y/10000)
    this.ymin = Math.min(this.ymin, x/10000)
    this.ymax = Math.max(this.ymax, x/10000)
  }
  get(x, y) {
    if (!this.data.hasOwnProperty(x))
      return null
    if (!this.data[x].hasOwnProperty(y))
      return null
    return this.data[x][y];
  }
  aslist() {
    let lst = []
    for (let [x, ys] of Object.entries(this.data).sort((a, b) => a[0]-b[0])) {
      for (let [y, m] of Object.entries(ys).sort((a, b) => a[0]-b[0])) {
        lst.push([x/10000, y/10000, m.n, m.loss.mse, m.loss.chisq, m.loss.pval])
      }
    }
    return lst
  }
}

export default {
  data: () => ({
    selected_npL: 1,
    selected_npU: 1,
    selected_n: 10,
    isGiant_lucky: false,
    forceMSE: false,
    bestPval: 0,
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
    isGoodVal,
    formatFixed,
    formatKMG,
    makeBinomialArray,
    makeBinomialArraysForGiant,
    sumDistributions,
    loss,
    applyGiantBonus,

    ul2u(ul, luck, mean) {
      const u = mean/(1-luck) - (luck*ul)/(1-luck)
      return u
    },
    l2u(l, luck, mean) {
      const u = mean - luck*l
      return u
    },
    findPsStep(psGridDotsMap, initU, initL, stepsize, initModel) {
      const radius = 30
      let best = { il: 0, iu: 0, model: initModel }
      for (let il = -radius; il <= radius; il++) {
        for (let iu = -radius; iu <= radius; iu++) {
          const newU = initU+iu*stepsize
          const newL = initL+il*stepsize
          if (newU < 0) continue
          if (newL < 0) continue
          const uUpperBound = (this.isGiant) ? this.sweepRange.u_hi : this.l2u(newL/10000, this.stats.lucky.shareLo, this.sweepRange.u_hi)
          if (newU/10000 > uUpperBound) continue
          const uLowerBound = this.l2u(newL/10000, this.stats.lucky.shareHi, this.sweepRange.u_lo)
          if (newU/10000 < uLowerBound) continue
          let model = psGridDotsMap.get(newU, newL)
          if (model === null) {
            model = this.makemodelC(newL/10000, undefined, newU/10000, undefined)
            this.bestPval = Math.max(this.bestPval, model.loss.pval)
            psGridDotsMap.put(newU, newL, model)
            //console.log(initU, newU, initL, newL)
          }
          
          if (model.loss.mse < best.model.loss.mse)
            best = {il, iu, model}
        }
      }
      //console.log('step best', best)
      return best
    },
    findPsRound(psGridDotsMap, round, curU, curL, initModel, stepsize) {
      while (round <= 150) {
        let best = this.findPsStep(psGridDotsMap, curU, curL, stepsize, initModel)
        //console.log('findPsStep', curU, curL, 'best', best)
        if (best.il == 0 && best.iu == 0) {
          // nothing in radius was better than starting point
          console.log('no improvement on round', round)
          return {round, curU, curL, model: best.model}
        }
        curU += best.iu * stepsize
        curL += best.il * stepsize
        if (curL/10000 > this.stats.max)
          return {round, curU, curL, model: best.model}
        /*this.stats.psGridPath.push([
          round, 
          curU/10000, 
          curL/10000, 
          best.model.loss.chisq,
          //`round ${round} pL=${(curL/10000).toFixed(2)} pU=${(curU/10000).toFixed(2)} χ²=${best.model.loss.chisq.toFixed(2)} pval=${best.model.loss.pval.toFixed(2)}`,
        ])*/
        round++
      }
      //console.log('round best', best)
      return {round, curU, curL, model: initModel}
    },

    makemodelC(npL, n, npU) {
      // if n is specified, just creates a model
      // if not specified, sweeps to find best n
      let n_candidates = [n]
      if (n === undefined) {
        n_candidates = [10, 20, 40, 120]
        n_candidates = n_candidates.filter((n) => (n >= npL && n >= npU && n >= this.stats.max))
        //n_candidates.push(this.stats.max)
      }

      let best_model = {n: undefined, loss: {mse: undefined, chisq: undefined, pval: undefined}}
      if (this.stats.unlucky.len == 0) return best_model
      
      n_candidates.forEach((n) => {
        const model = {npL, n, npU}
        if (this.isGiant) {
          const arrays = this.makeBinomialArraysForGiant(npU, this.stats.unlucky.len, npL, this.stats.lucky.len, n, this.isGiant_lucky)
          model.bellU = arrays.bellU
          model.bellL = arrays.bellL
          model.bell = this.sumDistributions(model.bellL, model.bellU)
        }
        else {
          model.bellU = this.makeBinomialArray(npU, this.stats.unlucky.len, n)
          model.bellL = this.makeBinomialArray(npU+npL, this.stats.lucky.len, n)
          model.bell = this.sumDistributions(model.bellL, model.bellU)
        }

        model.loss = this.loss(model.bell, this.histogram.map, 3)
        //console.log('makemodelC npU', npU, 'npL', npL, 'n', n, '->', model.loss)

        //const better_pval = isGoodVal(model.loss.pval) && (!isGoodVal(best_model.loss.pval) || model.loss.pval > best_model.loss.pval)
        //const better_chisq = isGoodVal(model.loss.chisq) && (!isGoodVal(best_model.loss.chisq) || model.loss.chisq < best_model.loss.chisq)
        const better_mse = isGoodVal(model.loss.mse) && (!isGoodVal(best_model.loss.mse) || model.loss.mse < best_model.loss.mse)
        if (better_mse) {
          //console.log('new best model', npU, npL, n, model.loss.mse, model.loss.pval)
          best_model = model
        }

      })
      //console.log('makemodelC done: npU', npU, 'npL', npL, '->', best_model)
      if (!best_model)
        console.log('makemodelC failed', npL, npU, n)
      return best_model
    },

    applySelectedNpL(val) {
      if (val < 0) return
      if (val > this.selected_nL)
        this.selected_nL = Math.ceil(val)
      if (val > this.selected_n)
        this.selected_n = Math.ceil(val)
      this.selected_npL = val
    },

    applySelectedNpU(val) {
      if (val < 0) return
      if (val > this.selected_n)
        this.selected_n = Math.ceil(val)
      this.selected_npU = val
    },

    applySelectedNL(val) {
      if (val < 0) return
      if (val < this.selected_npL)
        this.selected_npL = val
      this.selected_nL = val
    },

    applySelectedNU(val) {
      if (val < 0) return
      if (val < this.selected_npU)
        this.selected_npU = val
      this.selected_nU = val
    },

    applySelectedN(val) {
      if (val < 0) return
      if (val < this.selected_npL)
        this.selected_npL = val
      if (val < this.selected_npU)
        this.selected_npU = val
      this.selected_n = val
    },

    meanOfDistribution(bell) {
      let events = 0
      let qty = 0
      for (let [k, y] of bell) {
        events += y
        qty += k * y
      }
      return qty / events
    }
  },
  computed: {
    modelC() {
      const model = this.makemodelC(this.selected_npL, this.selected_n, this.selected_npU)
      console.log('modelC', model)
      return model
    },

    sweepRange() {
      const ret = {
        u_lo: Math.max(0, this.stats.meanLo),
        u_init: this.stats.mean,
        u_hi: this.stats.meanHi,
        l_init: 0,
      }
      if (this.isGiant) {
        // find out the real (after flooring) bonus which is less than 1.684
        const bell_ordinary = this.makeBinomialArray(ret.u_init, this.stats.unlucky.len, 100, false)
        const mean_ordinary = this.meanOfDistribution(bell_ordinary)
        const bell_giant = this.makeBinomialArray(ret.u_init, this.stats.unlucky.len, 100, true)
        const mean_giant = this.meanOfDistribution(bell_giant)
        const bonus = mean_giant / mean_ordinary
        console.log('init giant bonus', bonus)
        ret.u_lo /= bonus
        ret.u_init /= bonus
        ret.u_hi /= bonus
      }
      return ret
    },

    modelCSweep() {
      if (isNaN(this.stats.mean)) return false
      this.bestPval = 0

      // 2d fit
      let round = 1

      const breadth = this.sweepRange.u_hi - this.sweepRange.u_lo
      let range = 10000 // 1.0 default
      if (breadth < 3)
        range = 5000 // 0.5
      if (breadth < 1.5)
        range = 2500 // 0.25
      if (breadth < 0.6)
        range = 1000 // 0.1
      if (breadth < 0.3)
        range = 500 // 0.05
      if (breadth < 0.12)
        range = 200
      if (breadth < 0.06)
        range = 100
      if (breadth < 0.03)
        range = 50
      let curU = Math.round(this.sweepRange.u_init*10000/range)*range
      let curL = Math.round(this.sweepRange.l_init*10000/range)*range
      if (curU < 0)
        curU = 0
      if (curL < 0)
        curL = 0
      let model = this.makemodelC(curL/10000, undefined, curU/10000, undefined)
      this.stats.psGridPath = [[
        0, 
        curU/10000, 
        curL/10000,
        model.loss.chisq, 
      ]]
      let psGridDotsMap = new Grid()
      psGridDotsMap.put(curU, curL, model)
      
      ;({round, curU, curL, model} = this.findPsRound(psGridDotsMap, round, curU, curL, model, range));
      //console.log('path', this.stats.psGridPath)
      const psGridDots = psGridDotsMap.aslist()
      //console.log('psGridDots', psGridDots)
      this.selected_npL = model.npL
      this.selected_npU = model.npU
      this.selected_n = model.n

      //if (this.selected_n == 0) return false

      console.log('modelCSweep', model, this.stats.lucky.mean)
      return { result: model, psGridDotsMap, psGridDots }
    },

    makeChartCHist() {
      const chartOption = {
        legend: {},
        tooltip: {
          trigger: 'axis',
          valueFormatter: v => formatFixed(v, 0),
        },
        dataset: [
          { source: this.histogram.arr },
          { source: this.modelC.bell },
          { source: this.modelC.bellL },
          { source: this.modelC.bellU },
        ],
        xAxis: {
          //axisLine: { onZero: false },
          //scale: false,
          min: this.stats.min == 0 ? -1 : null,
          max: this.stats.max < 5 ? this.stats.max + 1 : null,
        },
        yAxis: { 
          axisLine: { onZero: false } ,
          axisLabel: {
            formatter: value => this.formatKMG(value)
          },
        },
        grid: { left: 35, top: 30, right: 10, bottom: 20 },
        series: [
          {
            name: 'observed',
            type: 'bar',
            encode: { x: 0, y: 1, },
            tooltip: {
              trigger: 'axis',
              valueFormatter: v => formatFixed(v, 0),
            },
          },
          {
            name: 'model Σ',
            type: 'line',
            datasetIndex: 1,
            encode: { x: 0, y: 1 },
            showSymbol: false,
          },
          {
            name: 'model U',
            type: 'line',
            datasetIndex: 3,
            encode: { x: 0, y: 1 },
            showSymbol: false,
          },
          {
            name: 'model L',
            type: 'line',
            datasetIndex: 2,
            encode: { x: 0, y: 1 },
            showSymbol: false,
          },
        ],
      }
      return chartOption
    },

    makeChartCGrid() {
      const wanted_aspect = 500 / 220
      let {xmin, xmax, ymin, ymax} = this.modelCSweep.psGridDotsMap
      const xmid = (xmin + xmax) / 2
      const ymid = (ymin + ymax) / 2
      let padding = 0.2
      if (this.stats.mean < 2)
        padding = 0.05
      const xrange_src = 1.2 * (this.modelCSweep.psGridDotsMap.xmax - this.modelCSweep.psGridDotsMap.xmin) + padding
      const yrange_src = 1.2 * (this.modelCSweep.psGridDotsMap.ymax - this.modelCSweep.psGridDotsMap.ymin) + padding
      const src_aspect = xrange_src / yrange_src

      if (src_aspect > wanted_aspect) {
        const xrange = xrange_src
        const yrange = xrange_src / wanted_aspect
        xmin = xmid - xrange / 2
        xmax = xmid + xrange / 2
        ymin = ymid - yrange / 2
        ymax = ymid + yrange / 2
      }
      else {
        const xrange = yrange_src * wanted_aspect
        const yrange = yrange_src
        xmin = xmid - xrange / 2
        xmax = xmid + xrange / 2
        ymin = ymid - yrange / 2
        ymax = ymid + yrange / 2
      }
      const chartPadAspect = {xmin, xmax, ymin, ymax}

      const usingMSE = this.forceMSE || isNaN(this.modelCSweep.result.loss.pval)
      let color = usingMSE ? 
        ['#282', '#2c2', '#cc2', '#ccc'] : 
        ['#ccc', '#cc2', '#2c2', '#282']
      const visualMap = {
        inRange: { color },
        //show: false,
        calculable: true,
        precision: usingMSE ? 0 : 2,
        controller: { inRange: { color } },
        orient: 'vertical',
        top: 'center',
        right: 10,
        align: 'left',
        padding: 0,
      }
      let visualMapSpec = usingMSE ? {
        min: this.modelCSweep.result.loss.mse,
        max: this.modelCSweep.result.loss.mse * 2,
        dimension: 3,
        text: ['MSE', ''],
      } : {
        min: 0,
        max: this.bestPval,
        dimension: 5,
        text: ['p-val', ''],
      }

      const chartOption = {
        legend: {},
        tooltip: { 
          trigger: 'item',
          axisPointer: { type: 'cross' },
          formatter: function (params) {
            const d = params.data 
            const s = `npᵁ=${formatFixed(d[0], 2)}<br/>`+
              `npᴸ=${formatFixed(d[1], 2)}<br/>`+
              `n=${formatFixed(d[2], 2)}<br/>`+
              `MSE=${d[3].toLocaleString(undefined, { notation: "compact" })}<br/>`+
              //`χ²=${d[4].toLocaleString(undefined, { notation: "compact" })}<br/>`+
              `p-val=${formatFixed(d[5], 2)}<br/>`
            //console.log(d[0])
            return s;
          },
        },
        title: {},
        dataset: [
          { source: this.modelCSweep.psGridDots },
        ],
        xAxis: {
          name: "npᴸ", nameGap: 5,
          //min: (v => this.chartPadMin(v)),
          //max: (v => this.chartPadMax(v)),
          min: chartPadAspect.xmin,
          max: chartPadAspect.xmax,
          //scale: true,
          axisLabel: {
            showMinLabel: false,
            showMaxLabel: false,
          },
          axisLine: { onZero: false },
          //splitLine: { show: false }
        },
        yAxis: {
          name: "npᵁ", nameGap: 5,
          //min: (v => this.chartPadMin(v)),
          //max: (v => this.chartPadMax(v)),
          min: chartPadAspect.ymin,
          max: chartPadAspect.ymax,
          axisLabel: {
            showMinLabel: false,
            showMaxLabel: false,
          },
          axisLine: { onZero: false },
          //splitLine: { show: false }
        },
        grid: { left: 35, top: 30, right: 40, bottom: 20 },
        series: [
          {
            type: 'scatter',
            encode: { 
              x: 1, y: 0, tooltip: [1, 0, 3]
            },
            tooltip: {
              valueFormatter: v => `${v[1]} → ${formatFixed(v[2], 4)}`
            },
            symbolSize: 6,
            markArea: {
              silent: true,
              data: [
                [{
                  name: `M±${this.stats.generalSigmas}σ`,
                  coord: [
                    this.sweepRange.u_lo - this.sweepRange.u_init,
                    this.sweepRange.u_lo
                  ]
                }, {
                  coord: [
                    this.sweepRange.u_hi - this.sweepRange.u_init,
                    this.sweepRange.u_hi
                  ]
                }]
              ],
              label: {
                show: true,
                position: 'left',
              },
              itemStyle: {
                color: "rgba(0, 0, 200, 0)",
                borderWidth: 1,
                borderType: "dashed"
              }
            },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [
                (this.isGiant) ? [
                  {
                    name: 'low λ, high M',
                    label: { position: 'insideMiddleTop' },
                    coord: [
                      this.sweepRange.u_hi - this.sweepRange.u_init,
                      this.l2u(
                        this.sweepRange.u_hi - this.sweepRange.u_init, 
                        this.stats.lucky.shareLo, 
                        this.sweepRange.u_hi
                      )
                    ]
                  },
                  {
                    coord: [
                      this.modelCSweep.psGridDotsMap.xmax, 
                      this.l2u(
                        this.sweepRange.u_hi - this.sweepRange.u_init, 
                        this.stats.lucky.shareLo, 
                        this.sweepRange.u_hi
                      )
                    ]
                  }
                ]: [
                  {
                    name: 'low λ, high M',
                    label: { position: 'insideMiddleTop' },
                    coord: [
                      this.sweepRange.u_hi - this.sweepRange.u_init,
                      this.l2u(
                        this.sweepRange.u_hi - this.sweepRange.u_init, 
                        this.stats.lucky.shareLo, 
                        this.sweepRange.u_hi
                      )
                    ]
                  },
                  {
                    coord: [
                      this.modelCSweep.psGridDotsMap.xmax, 
                      this.l2u(
                        this.modelCSweep.psGridDotsMap.xmax,
                        this.stats.lucky.shareLo, 
                        this.sweepRange.u_hi
                      )
                    ]
                  }
                ],
                [
                  {
                    name: 'high λ, low M',
                    label: { position: 'insideMiddleBottom' },
                    coord: [
                      this.sweepRange.u_lo - this.sweepRange.u_init, 
                      this.l2u(
                        this.sweepRange.u_lo - this.sweepRange.u_init, 
                        this.stats.lucky.shareHi, 
                        this.sweepRange.u_lo
                      )
                    ]
                  },
                  {
                    coord: [
                      this.modelCSweep.psGridDotsMap.xmax, 
                      this.l2u(
                        this.modelCSweep.psGridDotsMap.xmax, 
                        this.stats.lucky.shareHi,
                        this.sweepRange.u_lo
                      )
                    ]
                  }
                ],
              ],
            }
          },
        ],
        visualMap: { ...visualMap, ...visualMapSpec },
      }
      
      return chartOption
    },
  },
}

</script>

<template>
  <span class="title">Model C</span>
  <span>: some points were taken from a distribution L,
    and the rest from distribution U,<br/>
  so (1 - λ) npᵁ + λ (npᵁ + npᴸ) = M, where 
  λ ∈ {{ formatFixed(stats.lucky.shareLo*100, 2) }}…{{ formatFixed(stats.lucky.shareHi*100, 2) }}% and 
  M ∈ {{ formatFixed(stats.mean - 1.96 * stats.meanErr, 2) }}…{{ formatFixed(stats.mean + 1.96 * stats.meanErr, 2) }}</span><br/>
  
  <p><input type="checkbox" v-model="isGiant"> with giant bonus on Unlucky</p>
  <p><input type="checkbox" v-model="isGiant_lucky"> with giant bonus on Lucky</p>

  <div style="float:left;">
    <div style="width:570px;height:270px;">
      <v-chart :option="makeChartCGrid" v-if="modelCSweep?.result?.npU"/>
      <div v-else class="inner">
        search failed (npᵁ=0)
      </div>
    </div>
    
    <div style="padding:1em;">
      <div style="float:left;">
        <table>
          <tr><th></th><th>npᵁ</th><th>npᴸ</th><th>n</th><th>MSE</th><th>p-val</th></tr>
          <tr :class="{ strike: stats.dBad }" v-if="modelCSweep.result">
            <td>Best fit:</td>
            <td>{{ formatFixed(modelCSweep.result.npU, 2) }}</td>
            <td>{{ formatFixed(modelCSweep.result.npL, 2) }}</td>
            <td>{{ modelCSweep.result.n }}</td>
            <td>{{ formatFixed(modelCSweep.result.loss.mse, 2) }}</td>
            <td>{{ formatFixed(modelCSweep.result.loss.pval, 4) }}</td>
          </tr>
          <tr>
            <td>Manual:</td>
            <td>{{ formatFixed(selected_npU, 2) }}</td>
            <td>{{ formatFixed(selected_npL, 2) }}</td>
            <td>{{ selected_n }}</td>
            <td>{{ formatFixed(modelC.loss.mse, 2) }}</td>
            <td>{{ formatFixed(modelC.loss.pval, 4) }}</td>
          </tr>
        </table>
        <p>
          <input type="range" @input="event => applySelectedNpU(Number(event.target.value))" :value="selected_npU" :min="stats.min" :max="stats.max" :step="0.01" class="vmid"> npᵁ
          <br/>
          <input type="range" @input="event => applySelectedNpL(Number(event.target.value))" :value="selected_npL" :min="0" :max="stats.max" :step="0.01" class="vmid"> npᴸ
          <br/>
          <input type="range" @input="event => applySelectedN(Number(event.target.value))" :value="selected_n" :min="1" :max="200" :step="1" class="vmid"> n
        </p>
      </div>
      <div style="clear:both;"></div>
    </div>
  </div>

  <div id="chartHisto" style="float:left;" v-if="modelC.bell">
    <v-chart :option="makeChartCHist" />
  </div>
  
  <div style="clear:both;"></div>

  <br/>
  <p class="fsxs">MSE: <i>Σ (observed - model)²</i>, discard nothing ← this is used for fitting</p>
  <p class="fsxs">χ²: discard bins where model &lt; 3, then <i>Σ (observed - model)² / model</i></p>
  <p class="fsxs">p-val: <i>1 - chisquare.cdf(χ², bins - 1 - dof) ← this depends too much on previous step discards</i></p>
</template>

<style scoped>

#chartHisto {
  float: left;
  width: 500px;
  height: 320px;
}

.inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>