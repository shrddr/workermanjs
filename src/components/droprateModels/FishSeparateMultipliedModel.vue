<script>
import { formatFixed } from '../../util.js'
import { loss } from '../../stats.js'
import { sampleSizeDistribution } from '../../fishLeaderboard.mjs'
import { uniformProduct3Cdf } from '../../separateMultipliedModel.mjs'

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
  emits: ['distribution-change'],
  components: { VChart },

  props: {
    stats: Object,
    histogram: Object,
    avg_size: Number,
    mode_relative: Boolean,
  },

  data: () => ({
    min1: 0.56,
    max1: 1.66,
    min2: 0.64,
    max2: 1.23,
    min3: 0.8,
    max3: 1.23,
  }),

  watch: {
    model: {
      immediate: true,
      handler() {
        const { min, max } = this.achievableRange
        const distribution = max > min
          ? sampleSizeDistribution(value => this.sizeCdf(value), min, max)
          : [[min - 1e-9, 0], [min, 1]]
        this.$emit('distribution-change', distribution)
      },
    },
    stats() {
      this.$refs.chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
    },
  },

  computed: {
    bounds1() {
      return this.normalizedBounds(this.min1, this.max1)
    },

    bounds2() {
      return this.normalizedBounds(this.min2, this.max2)
    },

    bounds3() {
      return this.normalizedBounds(this.min3, this.max3)
    },

    theoreticalMean() {
      const [min1, max1] = this.bounds1
      const [min2, max2] = this.bounds2
      const [min3, max3] = this.bounds3
      return this.avg_size * (min1 + max1) / 2 * (min2 + max2) / 2 * (min3 + max3) / 2
    },

    achievableRange() {
      const [min1, max1] = this.bounds1
      const [min2, max2] = this.bounds2
      const [min3, max3] = this.bounds3
      return {
        min: this.avg_size * min1 * min2 * min3,
        max: this.avg_size * max1 * max2 * max3,
      }
    },

    coversObservedRange() {
      return this.stats.len > 0 &&
        this.achievableRange.min <= this.stats.min &&
        this.achievableRange.max >= this.stats.max
    },

    model() {
      const data = []
      const binCount = Math.ceil(Math.max(this.stats.max, this.achievableRange.max))
      for (let bin = 0; bin < binCount; bin++) {
        const probability = this.sizeCdf(bin + 1) - this.sizeCdf(bin)
        data.push([bin, probability * this.stats.len])
      }
      return { data, loss: loss(data, this.histogram.map, 6) }
    },

    chartHistogram() {
      return this.asPercentages(this.histogram.arr)
    },

    chartModelData() {
      return this.asPercentages(this.model.data)
    },

    codeSnippet() {
      const [min1, max1] = this.bounds1
      const [min2, max2] = this.bounds2
      const [min3, max3] = this.bounds3
      const display = value => Number(value.toPrecision(12))
      return [
        'const averageSize = (baseSize + varySize) / 2',
        'const r1 = ' + display(min1) + ' + (' + display(max1 - min1) + ') * rand()',
        'const r2 = ' + display(min2) + ' + (' + display(max2 - min2) + ') * rand()',
        'const r3 = ' + display(min3) + ' + (' + display(max3 - min3) + ') * rand()',
        'const size = averageSize * r1 * r2 * r3',
      ].join('\n')
    },

    chartOption() {
      const currentZoom = this.$refs.chart?.getOption()?.dataZoom?.[0]
      const isZoomed = currentZoom &&
        (currentZoom.start > 0.001 || currentZoom.end < 99.999)
      const dataZoom = {
        type: 'inside',
        xAxisIndex: [0],
        filterMode: 'filter',
        zoomOnMouseWheel: true,
        moveOnMouseWheel: false,
        ...(isZoomed
          ? {
              start: null,
              end: null,
              startValue: currentZoom.startValue,
              endValue: currentZoom.endValue,
            }
          : { start: 0, end: 100, startValue: null, endValue: null }),
      }
      return {
        legend: {},
        title: {
          text: [
            'MSE=' + formatFixed(this.model.loss.mse, 2),
            'χ² p=' + formatFixed(this.model.loss.pval, 4),
          ].join('\n'),
          textStyle: { fontWeight: 'normal', fontSize: 11 },
          right: '3%',
          top: '10%',
        },
        tooltip: {
          trigger: 'axis',
          extraCssText: 'background: var(--color-background);border-color: gray;color: var(--color-text);',
          formatter(params) {
            const x = params[0].axisValue
            let result = '<div style="text-align:center;">[ ' + x + '...' + (x + 1) + ' )</div>'
            for (const item of params) {
              const y = formatFixed(item.data[1], 3) + '%'
              result += '<div><div style="display:inline-block;">' + item.marker + ' ' +
                item.seriesName + '</div><div style="float:right;margin-left:10px;font-weight:600">' +
                y + '</div></div>'
            }
            return result
          },
        },
        dataset: [
          { source: this.chartHistogram },
          { source: this.chartModelData },
        ],
        dataZoom: [dataZoom],
        xAxis: {
          maxInterval: 25,
          min: this.stats.min === 0 ? -1 : null,
          max: this.mode_relative
            ? (this.stats.max < 5
                ? this.stats.max + 1
                : Math.ceil(Math.max(this.stats.max, this.achievableRange.max) / 10) * 10)
            : Math.max(this.avg_size * 4, this.achievableRange.max),
        },
        yAxis: {
          name: '% of total',
          nameGap: 11,
          axisLine: { onZero: false },
          axisLabel: { formatter: value => formatFixed(value, 2) + '%' },
        },
        grid: {
          left: 10,
          top: 30,
          right: 10,
          bottom: 20,
          containLabel: true,
        },
        series: [
          { name: 'observed', type: 'bar', encode: { x: 0, y: 1 } },
          {
            name: 'model',
            type: 'line',
            datasetIndex: 1,
            encode: { x: 0, y: 1 },
            showSymbol: false,
            lineStyle: { width: 2 },
          },
        ],
      }
    },
  },

  methods: {
    formatFixed,

    normalizedBounds(first, second) {
      const min = Math.max(0, Number(first) || 0)
      const max = Math.max(0, Number(second) || 0)
      return [Math.min(min, max), Math.max(min, max)]
    },

    sizeCdf(value) {
      if (!(this.avg_size > 0)) return 0
      return uniformProduct3Cdf(value / this.avg_size, ...this.bounds1, ...this.bounds2, ...this.bounds3)
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
    <span>r1 ~ Uniform(</span>
    <input v-model.number="min1" type="number" min="0" step="0.01" aria-label="r1 minimum">
    <span>,</span>
    <input v-model.number="max1" type="number" min="0" step="0.01" aria-label="r1 maximum">
    <span>)</span>
  </div>
  <div class="controls">
    <span>r2 ~ Uniform(</span>
    <input v-model.number="min2" type="number" min="0" step="0.01" aria-label="r2 minimum">
    <span>,</span>
    <input v-model.number="max2" type="number" min="0" step="0.01" aria-label="r2 maximum">
    <span>)</span>
  </div>
  <div class="controls">
    <span>r3 ~ Uniform(</span>
    <input v-model.number="min3" type="number" min="0" step="0.01" aria-label="r3 minimum">
    <span>,</span>
    <input v-model.number="max3" type="number" min="0" step="0.01" aria-label="r3 maximum">
    <span>)</span>
  </div>

  <div class="summary">
    mean M = {{ formatFixed(theoreticalMean, 3) }},
    achievable range: min = {{ formatFixed(achievableRange.min, 3) }},
    max = {{ formatFixed(achievableRange.max, 3) }}
    <span
      v-if="stats.len > 0"
      role="img"
      :aria-label="coversObservedRange ? 'covers observed range' : 'does not cover observed range'"
    >{{ coversObservedRange ? '✓' : '✗' }}</span>
  </div>

  <div class="chart">
    <v-chart ref="chart" :option="chartOption" :update-options="{ notMerge: false }" autoresize />
  </div>

  <pre><code>{{ codeSnippet }}</code></pre>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  gap: 0.25em;
  margin: 0.25em 0;
}

.controls input {
  width: 5em;
}

.summary {
  margin: 0.25em 0 0.5em;
}

.chart {
  width: 646px;
  height: 400px;
}
</style>
