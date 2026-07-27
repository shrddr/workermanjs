<script>
import { formatFixed } from '../../util.js'
import { loss } from '../../stats.js'

import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  DatasetComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  DatasetComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
])

export default {
  components: {
    VChart,
  },

  props: {
    stats: Object,
    histogram: Object,
    avg_size: Number,
    mode_relative: Boolean,
  },

  data: () => ({
    rollCount: 4,
    square: false,
    offset: 1,
  }),

  computed: {
    modelName() {
      const names = {
        1: 'OneRoll',
        2: 'TwoRoll',
        3: 'ThreeRoll',
        4: 'FourRoll',
        5: 'FiveRoll',
        6: 'SixRoll',
      }
      return names[this.rollCount] + (this.square ? 'Squared' : '')
    },

    center() {
      return (Number(this.offset) || 0) + this.rollCount / 2
    },

    codeSnippet() {
      const offset = Number(this.offset) || 0
      const rolls = Array(this.rollCount).fill('rand()').join(' + ')
      const numerator = offset === 0 ? rolls : `${offset} + ${rolls}`
      const divisor = offset + this.rollCount / 2
      const sizeExpression = this.square
        ? 'averageSize * r * r'
        : 'averageSize * r'

      return [
        'const averageSize = (baseSize + varySize) / 2',
        `const r = (${numerator}) / ${divisor}`,
        `const size = ${sizeExpression}`,
      ].join('\n')
    },

    model() {
      const data = []
      const theoreticalMax = this.valueFromRollSum(this.rollCount)
      const binCount = Math.ceil(Math.max(this.stats.max, theoreticalMax))

      for (let bin = 0; bin < binCount; bin++) {
        const probability = this.sizeCdf(bin + 1) - this.sizeCdf(bin)
        const expected = probability * this.stats.len
        data.push([bin, expected])
      }

      return {
        data,
        loss: loss(data, this.histogram.map, 1),
      }
    },

    chartHistogram() {
      return this.asPercentages(this.histogram.arr)
    },

    chartModelData() {
      return this.asPercentages(this.model.data)
    },

    ksTest() {
      const data = this.stats.dataFlatSorted
      const sampleCount = data.length
      if (sampleCount === 0)
        return { statistic: undefined, pval: undefined }

      let dPlus = 0
      let dMinus = 0
      for (let index = 0; index < sampleCount; index++) {
        const modelCdf = Math.min(1, Math.max(0, this.sizeCdf(data[index])))
        dPlus = Math.max(dPlus, (index + 1) / sampleCount - modelCdf)
        dMinus = Math.max(dMinus, modelCdf - index / sampleCount)
      }

      const statistic = Math.max(dPlus, dMinus)
      return {
        statistic,
        pval: this.kolmogorovPValue(statistic, sampleCount),
      }
    },

    chartOption() {
      return {
        legend: {},
        title: {
          text: [
            `MSE=${formatFixed(this.model.loss.mse, 2)}`,
            `χ² p=${formatFixed(this.model.loss.pval, 4)}`,
            //`KS D=${formatFixed(this.ksTest.statistic, 4)}, p=${formatFixed(this.ksTest.pval, 4)}`,
          ].join('\n'),
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
          formatter(params) {
            const x = params[0].axisValue
            let result = `<div style="text-align:center;">[ ${x}...${x + 1} )</div>`

            for (const item of params) {
              const y = `${formatFixed(item.data[1], 3)}%`
              result += `<div>
                <div style="display:inline-block;">${item.marker} ${item.seriesName}</div>
                <div style="float:right;margin-left:10px;font-weight:600">${y}</div>
              </div>`
            }
            return result
          },
        },
        dataset: [
          { source: this.chartHistogram },
          { source: this.chartModelData },
        ],
        dataZoom: [{
          type: 'inside',
          xAxisIndex: [0],
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseWheel: false,
        }],
        xAxis: {
          min: this.stats.min === 0 ? -1 : null,
          max: this.mode_relative
            ? (this.stats.max < 5 ? this.stats.max + 1 : null)
            : this.avg_size * 3,
        },
        yAxis: {
          name: '% of total',
          axisLine: { onZero: false },
          axisLabel: {
            formatter: value => `${formatFixed(value, 2)}%`,
          },
        },
        grid: {
          left: 10,
          top: 30,
          right: 10,
          bottom: 20,
          containLabel: true,
        },
        series: [
          {
            name: 'observed',
            type: 'bar',
            encode: { x: 0, y: 1 },
          },
          {
            name: 'model',
            type: 'line',
            datasetIndex: 1,
            encode: { x: 0, y: 1 },
            showSymbol: false,
          },
        ],
      }
    },
  },

  methods: {
    kolmogorovPValue(statistic, sampleCount) {
      if (statistic <= 0) return 1

      const rootN = Math.sqrt(sampleCount)
      const lambda = (rootN + 0.12 + 0.11 / rootN) * statistic
      let sum = 0

      for (let termIndex = 1; termIndex <= 100; termIndex++) {
        const term = Math.exp(-2 * termIndex * termIndex * lambda * lambda)
        sum += (termIndex % 2 === 1 ? 1 : -1) * term
        if (term < 1e-12) break
      }

      return Math.min(1, Math.max(0, 2 * sum))
    },

    asPercentages(data) {
      const total = this.stats.len
      return data.map(([x, count]) => [
        x,
        total > 0 ? 100 * count / total : 0,
      ])
    },

    factorial(n) {
      let result = 1
      for (let value = 2; value <= n; value++)
        result *= value
      return result
    },

    combination(n, k) {
      return this.factorial(n) / (this.factorial(k) * this.factorial(n - k))
    },

    rollSumCdf(value) {
      if (value <= 0) return 0
      if (value >= this.rollCount) return 1

      let sum = 0
      for (let k = 0; k <= Math.floor(value); k++) {
        const sign = k % 2 === 0 ? 1 : -1
        sum += sign * this.combination(this.rollCount, k) *
          Math.pow(value - k, this.rollCount)
      }
      return sum / this.factorial(this.rollCount)
    },

    sizeCdf(value) {
      if (value <= 0 || this.avg_size <= 0) return 0

      const normalized = value / this.avg_size
      const transformed = this.square ? Math.sqrt(normalized) : normalized
      const rollSum = this.center * transformed - this.offset
      return this.rollSumCdf(rollSum)
    },

    valueFromRollSum(rollSum) {
      let normalized = (this.offset + rollSum) / this.center
      if (this.square)
        normalized *= normalized
      return this.avg_size * normalized
    },
  },
}
</script>

<template>
  <div class="controls">
    <label>
      rolls
      <select v-model.number="rollCount">
        <option :value="1">1</option>
        <option :value="2">2</option>
        <option :value="3">3</option>
        <option :value="4">4</option>
        <option :value="5">5</option>
        <option :value="6">6</option>
      </select>
    </label>

    <label>
      offset
      <input type="number" class="w5em" v-model.number="offset" min="0" step="0.1">
    </label>

    <label class="square-control">
      <input type="checkbox" v-model="square">
      square
    </label>
  </div>

  <div class="chart">
    <v-chart :option="chartOption" :update-options="{ notMerge: true }" autoresize />
  </div>

  <pre><code>{{ codeSnippet }}</code></pre>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  gap: 1em;
  margin: 0.5em 0;
}

.chart {
  width: 646px;
  height: 400px;
}
</style>
