<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import { makeBinomialArray, makeNormalArray, makeUniformArray, makeTriangularArray, sumDistributions, loss } from '../../stats.js'

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
    share_T: 0.5,
    M_T: 1.0,
    width_T: 0.76,

    selected_npU: 0.69,
    width_U: 0.49,


    selected_npL: 1.25,
    selected_std: 0.42,


    forceMSE: false,
    bestPval: 0,
  }),
  props: {
    stats: Object,
    histogram: Object,
    avg_size: Number,
    mode_relative: Boolean,
  },
  components: {
    VChart,
  },
  methods: {
    isGoodVal,
    formatFixed,
    formatKMG,
    makeBinomialArray,
    makeNormalArray,
    makeUniformArray,
    makeTriangularArray,
    sumDistributions,
    loss,

    
    makeModel(npU, npL, stdDev) {
      // if n is specified, just creates a model
      // if not specified, sweeps to find best n
      let stdDev_candidates = [stdDev]
      if (stdDev === undefined) {
        stdDev_candidates = [
          this.stats.mean * 0.23,
          this.stats.mean * 0.24,
          this.stats.mean * 0.25,
          this.stats.mean * 0.26,
          this.stats.mean * 0.27,
        ]
      }

      let best_model = {n: undefined, loss: {mse: undefined, chisq: undefined, pval: undefined}}
      if (this.stats.unlucky.len == 0) return best_model
      
      stdDev_candidates.forEach((stdDev) => {
        const model = {npL, stdDev, npU}
        
        //model.bellU = this.makeNormalArray(npU, this.stats.unlucky.len, this.stats.max, stdDev)
        //model.bellL = this.makeNormalArray(npU+npL, this.stats.lucky.len, this.stats.max, stdDev)
        //model.bellL = this.makeUniformArray(npL, this.stats.lucky.len, this.stats.max, 15)

        model.bellT = this.makeTriangularArray(this.M_T * this.avg_size, this.share_T * this.stats.len, this.stats.max, this.avg_size * this.width_T)
        model.bellU = this.makeTriangularArray(npU * this.avg_size, (1 - this.share_T) * this.stats.unlucky.len, this.stats.max, npU * this.avg_size * this.width_U)
        model.bellL = this.makeNormalArray(npL * this.avg_size, (1 - this.share_T) * this.stats.lucky.len, this.stats.max, stdDev * this.avg_size)
        

        model.bell = this.sumDistributions(model.bellL, model.bellU)
        model.bell = this.sumDistributions(model.bell, model.bellT)
        

        model.loss = this.loss(model.bell, this.histogram.map, 3)
        //console.log('makeModel npU', npU, 'npL', npL, 'n', n, '->', model.loss)

        //const better_pval = isGoodVal(model.loss.pval) && (!isGoodVal(best_model.loss.pval) || model.loss.pval > best_model.loss.pval)
        //const better_chisq = isGoodVal(model.loss.chisq) && (!isGoodVal(best_model.loss.chisq) || model.loss.chisq < best_model.loss.chisq)
        const better_mse = isGoodVal(model.loss.mse) && (!isGoodVal(best_model.loss.mse) || model.loss.mse < best_model.loss.mse)
        if (better_mse) {
          //console.log('new best model', npU, npL, n, model.loss.mse, model.loss.pval)
          best_model = model
          let sumX = 0
          let sumY = 0
          for (const [_, [sx, y_model]] of Object.entries(model.bell)) {
            sumX += y_model
            sumY += sx * y_model
          }
          best_model.sumX = sumX
          best_model.sumY = sumY
        }

      })
      //console.log('makeModel done: npU', npU, 'npL', npL, '->', best_model)
      if (!best_model)
        console.log('makeModel failed', npU, npL, stdDev)
      return best_model
    },

    applySelectedNpL(val) {
      if (val < 0) return
      if (val > this.selected_nL)
        this.selected_nL = Math.ceil(val)
      this.selected_npL = val
    },

    applySelectedNpU(val) {
      if (val < 0) return
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

    applySelectedStd(val) {
      if (val < 0) return
      this.selected_std = val
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
      const model = this.makeModel(this.selected_npU, this.selected_npL, this.selected_std)
      console.log('modelC', model)
      return model
    },

    makeHistogramOption() {
      const chartOption = {
        legend: {},
        tooltip: {
          trigger: 'axis',
          valueFormatter: v => formatFixed(v, 1),
        },
        dataset: [
          { source: this.histogram.arr },
          { source: this.modelC.bell },
          { source: this.modelC.bellL },
          { source: this.modelC.bellU },
          { source: this.modelC.bellT },
        ],
        xAxis: {
          //axisLine: { onZero: false },
          //scale: false,
          min: this.stats.min == 0 ? -1 : null,
          max: this.mode_relative ? (this.stats.max < 5 ? this.stats.max + 1 : null) : this.avg_size * 3,
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
          {
            name: 'model T',
            type: 'line',
            datasetIndex: 4,
            encode: { x: 0, y: 1 },
            showSymbol: false,
          },
        ],
      }
      return chartOption
    },
  },
}

</script>

<template>
  <span class="title">Fish Model</span>
  <span>: some points were taken from a distribution L,
    and the rest from distribution U,<br/>
  so (1 - λ) npᵁ + λ (npᵁ + npᴸ) = M, where 
  λ ∈ {{ formatFixed(stats.lucky.shareLo*100, 2) }}…{{ formatFixed(stats.lucky.shareHi*100, 2) }}% and 
  M ∈ {{ formatFixed(stats.mean - 1.96 * stats.meanErr, 2) }}…{{ formatFixed(stats.mean + 1.96 * stats.meanErr, 2) }}</span><br/>

  <div style="float:left;">
    <div style="padding:1em;">
      <div style="float:left;">
        <table>
          <tr>
            <th></th>
            <th>npᵁ</th>
            <th>npᴸ</th>
            <th>σ</th>
            <th>MSE</th>
            <th>p-val</th>
            <th>U/M</th>
            <th>(U+L)/M</th>
            <th>(U+L)/U</th>
            <th>Σx</th>
            <th>Σy</th>
          </tr>
          <tr>
            <td>Manual:</td>
            <td>{{ formatFixed(selected_npU, 2) }}</td>
            <td>{{ formatFixed(selected_npL, 2) }}</td>
            <td>{{ formatFixed(selected_std, 2) }}</td>
            <td>{{ formatFixed(modelC.loss.mse, 2) }}</td>
            <td>{{ formatFixed(modelC.loss.pval, 4) }}</td>
            <td>{{ formatFixed(selected_npU / avg_size, 2) }}</td>
            <td>{{ formatFixed((selected_npU + selected_npL) / avg_size, 2) }}</td>
            <td>{{ formatFixed((selected_npU + selected_npL) / selected_npU, 2) }}</td>
            <td>{{ formatFixed(modelC.sumX, 1) }}</td>
            <td>{{ formatFixed(modelC.sumY, 0) }}</td>
          </tr>
        </table>
        <p>
          <input type="range" v-model="share_T" :min="0" :max="1" :step="0.001" class="vmid"> {{ share_T }} share_T
          <br/>
          <input type="range" v-model="M_T" :min="0.9" :max="1.1" :step="0.001" class="vmid"> {{ M_T }} M_T
          <input type="range" v-model="width_T" :min="0.7" :max="0.8" :step="0.001" class="vmid"> {{ width_T }} width_T
          <br/>
          <input type="range" @input="event => applySelectedNpU(Number(event.target.value))" :value="selected_npU" :min="0" :max="1" :step="0.01" class="vmid"> npᵁ
          <input type="range" v-model="width_U" :min="0" :max="1" :step="0.01" class="vmid"> {{ width_U }} width_U
          <br/>
          <input type="range" @input="event => applySelectedNpL(Number(event.target.value))" :value="selected_npL" :min="0" :max="2" :step="0.01" class="vmid"> npᴸ
          <input type="range" @input="event => applySelectedStd(Number(event.target.value))" :value="selected_std" :min="0" :max="1" :step="0.01" class="vmid"> σ
        </p>
      </div>
      <div style="clear:both;"></div>
    </div>
  </div>

  <div id="chartHisto" style="float:left;" v-if="modelC.bell && modelC.npL != undefined">
    <v-chart :option="makeHistogramOption" />
  </div>
  
  <div style="clear:both;"></div>

  <br/>
  <p class="fsxs">MSE: <i>Σ (observed - model)²</i>, discard nothing ← this is used for fitting</p>
  <p class="fsxs">χ²: discard bins where model &lt; 3, then <i>Σ (observed - model)² / model</i></p>
  <p class="fsxs">p-val: <i>1 - chisquare.cdf(χ², bins - 1 - dof)</i> ← this is shown on scatter plot, non uniform because depends on previous step discards</p>
</template>

<style scoped>

#chartHisto {
  float: left;
  width: 600px;
  height: 400px;
}
</style>
