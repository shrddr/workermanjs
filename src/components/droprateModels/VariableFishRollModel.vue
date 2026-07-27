<script>
import { formatFixed } from '../../util.js'
import { loss } from '../../stats.js'

import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'

const DENSITY_STEP = 0.005
const CDF_STEP = 0.001
const TAIL_MASS_EPSILON = 1e-7

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  DataZoomComponent,
  DatasetComponent,
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
    unconditionalRolls: {
      type: Number,
      default: 2,
    },
  },

  data() {
    return {
      previousLowerCutoff: 0.24,
      previousUpperCutoff: 0.76,
      maxRolls: 36,
      square: false,
      offset: 1,
    }
  },

  computed: {
    decisionLower() {
      return Math.min(
        1,
        Math.max(0, Number(this.previousLowerCutoff) || 0),
      )
    },

    decisionUpper() {
      return Math.min(
        1,
        Math.max(0, Number(this.previousUpperCutoff) || 0),
      )
    },

    offsetValue() {
      return Math.max(0, Number(this.offset) || 0)
    },

    unconditionalRollsValue() {
      return Math.min(
        5,
        Math.max(0, Math.trunc(Number(this.unconditionalRolls) || 0)),
      )
    },

    maxRollsValue() {
      return Math.min(
        1000,
        Math.max(
          Math.max(1, this.unconditionalRollsValue),
          Math.trunc(Number(this.maxRolls) || 1),
        ),
      )
    },

    distribution() {
      const dx = DENSITY_STEP
      const maxRolls = this.maxRollsValue
      const initialRolls = Math.max(1, this.unconditionalRollsValue)
      const middle = [[this.decisionLower, this.decisionUpper]]
      const extremes = [[0, this.decisionLower], [this.decisionUpper, 1]]
      const stops = []
      let active

      if (initialRolls === maxRolls) {
        this.addStop(
          stops,
          maxRolls,
          this.uniformSumDensity(maxRolls, dx),
          dx,
        )
        return { dx, stops, totalMass: stops[0].mass }
      }

      if (initialRolls === 1) {
        active = this.intervalDensity(extremes, dx)
        this.addStop(stops, 1, this.intervalDensity(middle, dx), dx)
      }
      else {
        const precedingRolls = this.uniformSumDensity(initialRolls - 1, dx)
        active = this.convolveIntervals(precedingRolls, extremes, dx)
        this.addStop(
          stops,
          initialRolls,
          this.convolveIntervals(precedingRolls, middle, dx),
          dx,
        )
      }

      for (
        let rollCount = initialRolls + 1;
        rollCount <= maxRolls;
        rollCount++
      ) {
        if (rollCount === maxRolls) {
          this.addStop(
            stops,
            rollCount,
            this.convolveIntervals(active, [[0, 1]], dx),
            dx,
          )
          break
        }

        const stopped = this.convolveIntervals(active, middle, dx)
        this.addStop(stops, rollCount, stopped, dx)

        active = this.convolveIntervals(active, extremes, dx)
        if (this.densityMass(active, dx) < TAIL_MASS_EPSILON) break
      }

      const totalMass = stops.reduce((sum, stop) => sum + stop.mass, 0)
      return { dx, stops, totalMass }
    },

    multiplierCdfLookup() {
      const step = CDF_STEP
      const maxMultiplier = (
        this.offsetValue + this.maxRollsValue
      ) / (
        this.offsetValue + this.maxRollsValue / 2
      )
      const values = new Float64Array(Math.ceil(maxMultiplier / step) + 2)
      const groupValues = [
        new Float64Array(values.length),
        new Float64Array(values.length),
        new Float64Array(values.length),
        new Float64Array(values.length),
      ]

      for (let index = 0; index < values.length; index++) {
        const multiplier = index * step
        values[index] = this.distributionCdf(multiplier)
        const probabilities = this.distributionCdfs(multiplier)
        for (let group = 0; group < groupValues.length; group++) {
          groupValues[group][index] = probabilities[group]
        }
      }

      return {
        step,
        values,
        groupValues,
        groupTotals: this.distributionCdfs(Infinity),
      }
    },

    model() {
      const data = []
      const groupData = [[], [], [], []]
      const theoreticalMax = this.valueFromRollSum(
        this.maxRollsValue,
        this.maxRollsValue,
      )
      const binCount = Math.ceil(Math.max(this.stats.max, theoreticalMax))

      for (let bin = 0; bin < binCount; bin++) {
        const probability = this.sizeCdf(bin + 1) - this.sizeCdf(bin)
        const expected = probability * this.stats.len
        data.push([bin, expected])
        for (let group = 0; group < groupData.length; group++) {
          const groupProbability =
            this.sizeGroupCdf(bin + 1, group) -
            this.sizeGroupCdf(bin, group)
          groupData[group].push([bin, groupProbability * this.stats.len])
        }
      }

      return {
        data,
        groupData,
        loss: loss(data, this.histogram.map, 2),
      }
    },

    chartHistogram() {
      return this.asPercentages(this.histogram.arr)
    },

    chartModelData() {
      return this.asPercentages(this.model.data)
    },

    chartModelGroupData() {
      return this.model.groupData.map(data => this.asPercentages(data))
    },

    codeSnippet() {
      const sizeExpression = this.square
        ? 'averageSize * r * r'
        : 'averageSize * r'
      const decisionCondition =
        `(roll <= ${this.decisionLower} || roll >= ${this.decisionUpper})`

      return [
        'const averageSize = (baseSize + varySize) / 2',
        'let roll',
        'let rollCount = 0',
        'let randomRollSum = 0',
        'do {',
        '  roll = rand()',
        '  randomRollSum += roll',
        '  rollCount++',
        `} while ((rollCount < ${this.unconditionalRollsValue} || ${decisionCondition}) && rollCount < ${this.maxRollsValue})`,
        `const r = (${this.offsetValue} + randomRollSum) / (${this.offsetValue} + rollCount / 2)`,
        `const size = ${sizeExpression}`,
      ].join('\n')
    },

    chartOption() {
      return {
        legend: {},
        title: {
          text: [
            `MSE=${formatFixed(this.model.loss.mse, 2)}`,
            `χ² p=${formatFixed(this.model.loss.pval, 4)}`,
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
          ...this.chartModelGroupData.map(source => ({ source })),
        ],
        dataZoom: [{
          type: 'inside',
          xAxisIndex: [0],
          filterMode: 'filter',
          zoomOnMouseWheel: true,
          moveOnMouseWheel: false,
        }],
        xAxis: {
          min: this.stats.min === 0 ? -1 : null,
          max: this.mode_relative
            ? (this.stats.max < 5 ? this.stats.max + 1 : null)
            : this.avg_size * 4,
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
            lineStyle: { width: 3 },
          },
          {
            name: `${Math.max(1, this.unconditionalRollsValue)} rolls`,
            type: 'line',
            datasetIndex: 2,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { width: 1 },
          },
          {
            name: `${Math.max(1, this.unconditionalRollsValue) + 1} rolls`,
            type: 'line',
            datasetIndex: 3,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { width: 1 },
          },
          {
            name: `${Math.max(1, this.unconditionalRollsValue) + 2} rolls`,
            type: 'line',
            datasetIndex: 4,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { width: 1 },
          },
          {
            name: `${Math.max(1, this.unconditionalRollsValue) + 3} rolls`,
            type: 'line',
            datasetIndex: 5,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { width: 1 },
          },
        ],
      }
    },
  },

  methods: {
    formatFixed,

    intervalDensity(intervals, dx) {
      const density = new Float64Array(Math.ceil(1 / dx))
      for (let index = 0; index < density.length; index++) {
        const value = (index + 0.5) * dx
        for (const [start, end] of intervals) {
          if (value >= start && value < end) {
            density[index]++
            break
          }
        }
      }
      return density
    },

    uniformSumDensity(rollCount, dx) {
      let density = this.intervalDensity([[0, 1]], dx)
      for (let count = 2; count <= rollCount; count++)
        density = this.convolveIntervals(density, [[0, 1]], dx)
      return density
    },

    convolveInterval(density, start, end, dx) {
      if (end <= start) return new Float64Array(density.length)

      const prefix = new Float64Array(density.length + 1)
      for (let index = 0; index < density.length; index++)
        prefix[index + 1] = prefix[index] + density[index] * dx

      const integralAt = value => {
        if (value <= 0) return 0
        if (value >= density.length * dx) return prefix[density.length]
        const position = value / dx
        const index = Math.floor(position)
        const fraction = position - index
        return prefix[index] + fraction * density[index] * dx
      }

      const result = new Float64Array(
        density.length + Math.ceil(end / dx),
      )
      for (let index = 0; index < result.length; index++) {
        const value = (index + 0.5) * dx
        result[index] = integralAt(value - start) - integralAt(value - end)
      }
      return result
    },

    convolveIntervals(density, intervals, dx) {
      let result = new Float64Array(0)
      for (const [start, end] of intervals) {
        const part = this.convolveInterval(density, start, end, dx)
        if (part.length > result.length) {
          const expanded = new Float64Array(part.length)
          expanded.set(result)
          result = expanded
        }
        for (let index = 0; index < part.length; index++)
          result[index] += part[index]
      }
      return result
    },

    densityMass(density, dx) {
      let mass = 0
      for (const value of density) mass += value * dx
      return mass
    },

    addStop(stops, rollCount, density, dx) {
      const cdf = new Float64Array(density.length + 1)
      for (let index = 0; index < density.length; index++)
        cdf[index + 1] = cdf[index] + density[index] * dx
      stops.push({
        rollCount,
        cdf,
        mass: cdf[cdf.length - 1],
      })
    },

    stopCdf(stop, sum) {
      if (sum <= 0) return 0
      const position = sum / this.distribution.dx
      if (position >= stop.cdf.length - 1) return stop.mass
      const index = Math.floor(position)
      const fraction = position - index
      return stop.cdf[index] +
        fraction * (stop.cdf[index + 1] - stop.cdf[index])
    },

    distributionCdfs(multiplier) {
      const probabilities = [0, 0, 0, 0]
      if (multiplier <= 0) return probabilities
      const initialRolls = Math.max(1, this.unconditionalRollsValue)
      for (const stop of this.distribution.stops) {
        const center = this.offsetValue + stop.rollCount / 2
        const sum = center * multiplier - this.offsetValue
        const conditionalRolls = stop.rollCount - initialRolls
        if (conditionalRolls < probabilities.length)
          probabilities[conditionalRolls] += this.stopCdf(stop, sum)
      }
      return probabilities.map(
        probability => probability / this.distribution.totalMass,
      )
    },

    distributionCdf(multiplier) {
      if (multiplier <= 0) return 0
      let probability = 0
      for (const stop of this.distribution.stops) {
        const center = this.offsetValue + stop.rollCount / 2
        const sum = center * multiplier - this.offsetValue
        probability += this.stopCdf(stop, sum)
      }
      return probability / this.distribution.totalMass
    },

    multiplierCdf(multiplier) {
      if (multiplier <= 0) return 0
      const { step, values } = this.multiplierCdfLookup
      const position = multiplier / step
      if (position >= values.length - 1) return 1
      const index = Math.floor(position)
      const fraction = position - index
      return values[index] + fraction * (values[index + 1] - values[index])
    },

    multiplierGroupCdf(multiplier, group) {
      if (multiplier <= 0) return 0
      const {
        step,
        groupValues,
        groupTotals,
      } = this.multiplierCdfLookup
      const values = groupValues[group]
      const position = multiplier / step
      if (position >= values.length - 1) return groupTotals[group]
      const index = Math.floor(position)
      const fraction = position - index
      return values[index] + fraction * (values[index + 1] - values[index])
    },

    sizeCdf(value) {
      if (value <= 0 || this.avg_size <= 0) return 0
      const normalized = value / this.avg_size
      const multiplier = this.square ? Math.sqrt(normalized) : normalized
      return this.multiplierCdf(multiplier)
    },

    sizeGroupCdf(value, group) {
      if (value <= 0 || this.avg_size <= 0) return 0
      const normalized = value / this.avg_size
      const multiplier = this.square ? Math.sqrt(normalized) : normalized
      return this.multiplierGroupCdf(multiplier, group)
    },

    valueFromRollSum(rollSum, rollCount) {
      let normalized = (
        this.offsetValue + rollSum
      ) / (
        this.offsetValue + rollCount / 2
      )
      if (this.square) normalized *= normalized
      return this.avg_size * normalized
    },

    asPercentages(data) {
      const total = this.stats.len
      return data.map(([x, count]) => [
        x,
        total > 0 ? 100 * count / total : 0,
      ])
    },
  },
}
</script>

<template>
  <div class="controls">
    <span class="previous-cutoffs">
      <input
        v-model.number="previousLowerCutoff"
        type="number"
        min="0"
        max="1"
        step="0.005"
        aria-label="lower previous-roll cutoff"
      >
      ≥ previous roll ≥
      <input
        v-model.number="previousUpperCutoff"
        type="number"
        min="0"
        max="1"
        step="0.005"
        aria-label="upper previous-roll cutoff"
      >
    </span>

    <label>
      max rolls
      <input
        v-model.number="maxRolls"
        type="number"
        class="w5em"
        :min="Math.max(1, unconditionalRollsValue)"
        max="1000"
        step="1"
        @change="maxRolls = maxRollsValue"
      >
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
    <v-chart :option="chartOption" :update-options="{ notMerge: false }" autoresize />
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

.w5em {
  width: 5em;
}

.previous-cutoffs input {
  width: 5em;
}

.chart {
  width: 646px;
  height: 400px;
}
</style>
