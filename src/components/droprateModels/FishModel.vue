<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import { makeBinomialArray, makeNormalArray, makeLognormalArray, makeUniformArray, makeTriangularArray, makeGammaArray, sumDistributions, loss } from '../../stats.js'
import FishCurve from './FishCurve.vue'

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
    curves: [],
    presets: [
      [
        {amount: 1.00, kind: 'Lognormal', emu: 1.00, sigma: 0.41},
      ],
      [
        {amount: 1.00, kind: 'Gamma', at: 1.05, theta: 0.164},
      ],
      [
        {amount: 0.83, kind: 'Normal', mean: 1.08, sigma: 0.38},
        {amount: 1.00, kind: 'Normal', mean: 0.69, sigma: 0.16},
      ],
      [
        {amount: 0.48, kind: 'Normal', mean: 0.74, sigma: 0.20},
        {amount: 0.76, kind: 'Normal', mean: 1.20, sigma: 0.21},
        {amount: 1.00, kind: 'Normal', mean: 1.64, sigma: 0.22},
      ],
      [
        {amount: 0.50, kind: 'Triangular', center: 1.00, width: 0.76},
        {amount: 0.32, kind: 'Triangular', center: 0.69, width: 0.34},
        {amount: 1.00, kind: 'Normal',       mean: 1.25, sigma: 0.42},
      ],
      [
        {amount: 0.25, kind: 'Normal', mean: 0.62, sigma: 0.16},
        {amount: 0.34, kind: 'Normal', mean: 0.87, sigma: 0.15},
        {amount: 0.50, kind: 'Normal', mean: 1.18, sigma: 0.18},
        {amount: 1.00, kind: 'Normal', mean: 1.47, sigma: 0.28},
      ],
    ],
    forceMSE: false,
    bestPval: 0,
  }),
  mounted() {
    this.loadPreset(0)
  },
  props: {
    stats: Object,
    histogram: Object,
    avg_size: Number,
    mode_relative: Boolean,
  },
  components: {
    VChart,
    FishCurve,
  },
  methods: {
    isGoodVal,
    formatFixed,
    formatKMG,
    makeBinomialArray,
    makeNormalArray,
    makeLognormalArray,
    makeUniformArray,
    makeGammaArray,
    makeTriangularArray,
    sumDistributions,
    loss,

    removeCurve(index) {
      this.curves.splice(index, 1)
      this.curves[this.curves.length-1].amount = 1
    },
    
    addCurve() {
      this.curves[this.curves.length-1].amount /= 2
      this.curves.push(
        {amount: 1, kind:'Normal', mean: 1, sigma: 0.1},
      )
    },

    loadPreset(index) {
      const preset = this.presets[index]
      this.curves = []
      for (const curve of preset) this.curves.push({...curve})
    },

    makeModel() {
      const model = {
        bells: [],
        bell: [],
      }
      let variables = -1
      let amount_remain = this.stats.len
      for (const curve of this.curves) {
        let bell = null
        variables += 3
        switch(curve.kind) {
          case 'Normal':
            if (curve.amount == 'rest') curve.amount = amount_remain
            bell = this.makeNormalArray(
              curve.mean * this.avg_size,
              curve.amount * amount_remain,
              this.stats.max,
              curve.sigma * this.avg_size
            )
            amount_remain -= curve.amount * amount_remain
            //console.log('normal', bell)
            break
          case 'Triangular':
            bell = this.makeTriangularArray(
              curve.center * this.avg_size, 
              curve.amount * amount_remain,
              this.stats.max, 
              curve.width * this.avg_size
            )
            amount_remain -= curve.amount * amount_remain
            //console.log('triangle', bell)
            break
          case 'Uniform':
            bell = this.makeUniformArray(
              curve.center * this.avg_size, 
              curve.amount * amount_remain,
              this.stats.max, 
              curve.width * this.avg_size
            )
            amount_remain -= curve.amount * amount_remain
            //console.log('triangle', bell)
            break
          case 'Gamma':
            bell = this.makeGammaArray(
              curve.at / curve.theta,
              curve.amount * amount_remain,
              this.stats.max, 
              curve.theta * this.avg_size
            )
            amount_remain -= curve.amount * amount_remain
            //console.log('triangle', bell)
            break
          case 'Lognormal':
            bell = this.makeLognormalArray(
              Math.log(curve.emu * this.avg_size),
              curve.amount * amount_remain,
              this.stats.max,
              curve.sigma
            )
            amount_remain -= curve.amount * amount_remain
            //console.log('triangle', bell)
            break
          default:
            throw Error(`unknown curve kind ${curve.kind}`)
        }
        model.bells.push(bell)
        model.bell = this.sumDistributions(model.bell, bell)
      }

      model.loss = this.loss(model.bell, this.histogram.map, variables)
      //console.log('makeModel done: npU', npU, 'npL', npL, '->', best_model)
      if (!model)
        console.log('makeModel failed', npU, npL, stdDev)
      return model
    },
  },
  
  computed: {
    modelC() {
      const model = this.makeModel()
      console.log('model', model)
      return model
    },

    makeHistogramOption() {
      const chartOption = {
        legend: {},
        title: {
          text: `MSE=${formatFixed(this.modelC.loss.mse, 2)}\np-val=${formatFixed(this.modelC.loss.pval, 4)}`,
          textStyle: {
            fontWeight: 'normal',
            fontSize: 11,
          },
          right: '3%',
          top: '10%',
        },
        tooltip: {
          trigger: 'axis',
          extraCssText: 'background: var(--color-background);border-color: gray;color: var(--color-text);',
          valueFormatter: v => formatFixed(v, 1),
          formatter: function (params) {
            const x = params[0].axisValue
            let result = `<div style="text-align:center;">[ ${x}...${x+1} )</div>`

            params.forEach(item => {
              const y = item.seriesName == 'observed' ? item.data[1] : formatFixed(item.data[1], 1)
              result += `<div>
                <div style="display:inline-block;">${item.marker} ${item.seriesName}</div>
                <div style="float:right;margin-left:10px;font-weight:600">${y}</div>
              </div>`
            })

            return result
          }
        },
        dataset: [
          { source: this.histogram.arr },
          { source: this.modelC.bell },
          // ...
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
        grid: { 
          left: 35, top: 30, right: 10, bottom: 20,
        },
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
            name: 'curve Σ',
            type: 'line',
            datasetIndex: 1,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { opacity: 1 },
          },
          // ...
        ],
      }
      for (const [i, bell] of this.modelC.bells.entries()) {
        chartOption.dataset.push({
          source: bell
        })
        chartOption.series.push({
          name: `curve ${i}`,
          type: 'line',
          datasetIndex: 2 + i,
          encode: { x: 0, y: 1 },
          showSymbol: false,
          lineStyle: { opacity: 1 },
        })
      }
      return chartOption
    },
  },
}

</script>

<template>
  <div>
    <button v-for="(_, index) in presets" @click="loadPreset(index)">preset{{ index }}</button>

    <table>
      <tr v-for="(_, index) in curves">
        <td>
          {{ index }}
        </td>
        <FishCurve
          :key="index"
          :isLast="index == curves.length - 1"
          v-model:me="curves[index]"
          @delete="removeCurve(index)"
        />
      </tr>
    </table>
    <button @click="addCurve">add curve</button>
  </div>

  <div id="chartHisto" style="float:left;" v-if="modelC.bell">
    <v-chart :option="makeHistogramOption" :update-options="{notMerge: true}" autoresize />
  </div>
  
  <div style="clear:both;"></div>

</template>

<style scoped>

#chartHisto {
  float: left;
  width: 646px;
  height: 400px;
}
</style>
