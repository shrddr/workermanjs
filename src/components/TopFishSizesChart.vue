<script>
import VChart, { THEME_KEY } from 'vue-echarts'
import { inject, unref } from 'vue'
import { theoreticalLeaderboard } from '../fishLeaderboard.mjs'
import { use } from 'echarts/core'
import { DataZoomInsideComponent } from 'echarts/components'

use([DataZoomInsideComponent])

function buildSurvivalData(sortedSizes) {
  const sorted = sortedSizes.filter(Number.isFinite)
  const data = []
  for (let index = 0; index < sorted.length; index++) {
    if (index === 0 || sorted[index] !== sorted[index - 1]) {
      data.push([sorted[index], sorted.length - index])
    }
  }
  return data
}

export default {
  components: { VChart },
  setup() {
    return { chartTheme: inject(THEME_KEY, null) }
  },

  props: {
    modelDistribution: { type: Array, default: () => [] },
    speciesCatchCounts: { type: Array, default: () => [] },
    sizes: {
      type: Array,
      required: true,
    },
    personalAnnouncementsSorted: {
      type: Array,
      required: true,
    },
    itemkeyCount: {
      type: Number,
      required: true,
    },
    observedMax: Number,
  },

  data() {
    return { logarithmicYAxis: true, zoomedYMax: null }
  },

  watch: {
    sizes() { this.zoomedYMax = null },
    personalAnnouncementsSorted() { this.zoomedYMax = null },
  },

  methods: {
    zoomYAxis(event) {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 450 : 1)
      if (!delta) return
      const currentMax = Math.min(this.fullYMax, this.zoomedYMax ?? this.fullYMax)
      const step = Math.max(-1, Math.min(1, delta * 0.002))
      const factor = Math.exp(step)
      // Add a signed step in log space; scale the span around 1 in linear mode.
      const nextMax = this.logarithmicYAxis
        ? Math.exp(Math.log(currentMax) + step)
        : 1 + (currentMax - 1) * factor
      this.zoomedYMax = Math.max(2, Math.min(this.fullYMax, nextMax))
    },
  },

  computed: {
    survivalData() {
      return buildSurvivalData([...this.sizes].sort((a, b) => a - b))
    },

    personalSurvivalData() {
      return buildSurvivalData(this.personalAnnouncementsSorted)
    },

    theoreticalSurvivalData() {
      return theoreticalLeaderboard(this.modelDistribution, this.speciesCatchCounts)
    },

    fullYMax() {
      return Math.ceil(Math.max(2, this.survivalData[0]?.[1] ?? 0,
        this.personalSurvivalData[0]?.[1] ?? 0, this.theoreticalSurvivalData[0]?.[1] ?? 0))
    },

    chartOption() {
      const data = this.survivalData
      const personalData = this.personalSurvivalData
      const curves = [
        { name: 'model', data: this.theoreticalSurvivalData, expected: true },
        { name: 'obs.personal', data: personalData },
        { name: 'obs.region', data },
      ]
      const palette = unref(this.chartTheme)?.color ?? ['#5470c6', '#91cc75', '#fac858']
      const yMax = Math.ceil(Math.min(this.fullYMax, this.zoomedYMax ?? this.fullYMax))
      return {
        animation: false,
        color: [palette[1], palette[0], palette[2]],
        legend: { data: ['model', 'obs.personal', 'obs.region'] },
        grid: { left: 46, right: 14, top: 30, bottom: 25 },
        tooltip: {
          trigger: 'axis',
          //axisPointer: { type: 'cross', label: { show: false } },
          extraCssText: 'background: var(--color-background);border-color: gray;color: var(--color-text);',
          formatter: params => {
            const size = Number(params[0]?.axisValue)
            if (!Number.isFinite(size)) return ''
            const counts = params.map(item => {
              const count = item.data[1].toLocaleString(undefined, { maximumFractionDigits: 2 })
              const unit = curves[item.seriesIndex]?.expected ? 'expected updates' : 'updates'
              return `${item.marker} ${item.seriesName}: ${count} ${unit}`
            })
            return [`size ≥ ${size.toFixed(3)}`, ...counts].join('<br>')
          },
        },
        xAxis: {
          type: 'value',
          scale: true,
          maxInterval: 25,
          axisLabel: { showMinLabel: false, showMaxLabel: null },
          //nameLocation: 'middle',
          //nameGap: 30,
          min: null,
          max: null,
        },
        yAxis: {
          name: 'updates',
          nameGap: 11,
          type: this.logarithmicYAxis ? 'log' : 'value',
          min: 1,
          max: this.fullYMax,
          //nameLocation: 'middle',
        },
        dataZoom: [{
          type: 'inside',
          yAxisIndex: 0,
          xAxisIndex: [],
          filterMode: 'filter',
          rangeMode: ['value', 'value'],
          startValue: 1,
          endValue: yMax,
          // Our wheel handler controls the range, keeping its lower end at 1.
          disabled: true,
        }],
        series: curves.map(curve => ({
          id: curve.name,
          name: curve.name,
          type: 'line',
          data: curve.data,
          sampling: 'none',
          step: curve.expected ? false : 'start',
          showSymbol: false,
          lineStyle: { width: 1 },
        })),
      }
    },
  },
}
</script>

<template>
  <section class="ranking-chart">
    <template v-if="survivalData.length || personalSurvivalData.length">
      Leaderboard: {{ itemkeyCount }} species, {{ personalAnnouncementsSorted.length }} personal, {{ sizes.length }} region
      <label>
        <input v-model="logarithmicYAxis" type="checkbox">
        log(Y)
      </label>
      <div @wheel.prevent="zoomYAxis">
        <v-chart :option="chartOption" :update-options="{ lazyUpdate: true }" autoresize />
      </div>
    </template>
    <p v-else>No leaderboard sizes for this selection.</p>
  </section>
</template>

<style scoped>
.ranking-chart {
  margin-top: 1.5em;
}

.ranking-chart h3 {
  margin-bottom: 0.25em;
}

.echarts {
  width: 646px;
  height: 400px;
  max-width: 100%;
}

.ranking-note {
  font-size: 0.85em;
}
</style>
