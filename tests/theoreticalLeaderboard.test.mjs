import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { reactive, computed, watch, nextTick } from 'vue'
import { jStat } from 'jstat-esm'
import { productDistribution, productStopCdf } from '../src/variableRollProduct.mjs'
import { uniformProduct3Cdf } from '../src/separateMultipliedModel.mjs'
import {
  leaderboardAnnouncements, expectedLeaderboardUpdates, sampleSizeDistribution, theoreticalLeaderboard,
} from '../src/fishLeaderboard.mjs'

test('expected updates match the full binomial sum, including the rare tail', () => {
  for (const n of [5, 11, 40, 80, 200, 1000]) {
    for (const p of [0, 1e-5, 0.01, 0.1, 0.3, 0.8, 0.999999999999, 1]) {
      let exact = 0
      let updates = 0
      for (let m = 0; m <= n; m++) {
        if (m > 0) updates += Math.min(1, 10 / m)
        exact += jStat.binomial.pdf(m, n, p) * updates
      }
      assert.ok(Math.abs(expectedLeaderboardUpdates(n, p) - exact) < 1e-7, `${n}, ${p}`)
    }
  }
})

test('analytic curve agrees with chronological replay averaged over trials', () => {
  let seed = 1729
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32)
  let total = 0
  const trials = 6000
  for (let trial = 0; trial < trials; trial++) {
    const announcements = leaderboardAnnouncements(Array.from({ length: 200 }, random))
    total += announcements.filter(size => size >= 0.9).length
  }
  assert.ok(Math.abs(total / trials - expectedLeaderboardUpdates(200, 0.1)) < 0.15)
})

test('groups sum separate ten-slot boards and curve ends exactly at one update', () => {
  const distribution = sampleSizeDistribution(x => x / 100, 0, 100)
  const result = theoreticalLeaderboard(distribution, [100, 200, 100])
  assert.ok(Math.abs(result[0][1] - (2 * expectedLeaderboardUpdates(100, 1) +
    expectedLeaderboardUpdates(200, 1))) < 1e-10)
  assert.notEqual(result[0][1], expectedLeaderboardUpdates(400, 1))
  assert.equal(result.at(-1)[1], 1)
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i][0] >= result[i - 1][0])
    assert.ok(result[i][1] <= result[i - 1][1] + 1e-8)
  }
  assert.deepEqual(theoreticalLeaderboard(distribution, []), [])
})

function loadOptions(file) {
  const source = readFileSync(new URL(`../src/components/droprateModels/${file}.vue`, import.meta.url), 'utf8')
    .split('<script>')[1].split('</script>')[0]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace('export default', 'module.exports =')
  const context = {
    module: { exports: {} }, console, jStat, sampleSizeDistribution,
    productDistribution, productStopCdf, uniformProduct3Cdf,
    use() {}, loss: () => ({}), formatFixed: String, isGoodVal: Number.isFinite,
    sumDistributions: (a, b) => a.concat(b),
  }
  for (const name of ['CanvasRenderer', 'BarChart', 'LineChart', 'ScatterChart', 'DataZoomComponent',
    'DatasetComponent', 'GridComponent', 'LegendComponent', 'TitleComponent', 'TooltipComponent',
    'TransformComponent', 'MarkLineComponent', 'MarkAreaComponent', 'VChart', 'FishCurve']) context[name] = {}
  for (const name of ['makeBinomialArray', 'makeNormalArray', 'makeLognormalArray', 'makeUniformArray',
    'makeTriangularArray', 'makeGammaArray']) context[name] = () => []
  vm.runInNewContext(source, context)
  return context.module.exports
}

function modelHarness(file, modelKey = 'model') {
  const options = loadOptions(file)
  let distribution = []
  const state = reactive({
    ...options.data(), avg_size: 100, mode_relative: true,
    stats: { max: 310, min: 20, len: 571 }, histogram: { map: {} }, $refs: {},
    $emit: (event, value) => { if (event === 'distribution-change') distribution = value },
  })
  for (const [name, fn] of Object.entries(options.methods)) state[name] = fn.bind(state)
  for (const [name, fn] of Object.entries(options.computed)) {
    const value = computed(() => fn.call(state))
    Object.defineProperty(state, name, { get: () => value.value, configurable: true })
  }
  const stop = watch(() => state[modelKey], () => options.watch[modelKey].handler.call(state), { immediate: true })
  return { state, stop, distribution: () => distribution }
}

test('variable model publishes new CDFs for every leaderboard-relevant control', async () => {
  const harness = modelHarness('FishVariableRollSumModel')
  const { state } = harness
  assert.equal(harness.distribution().length, 2049)
  for (const [control, value] of Object.entries({ maxRolls: 9, previousLowerCutoff: 0.19,
    previousUpperCutoff: 0.83, unconditionalRolls: 3, offset: 1.1, square: true, avg_size: 200 })) {
    const before = JSON.stringify(harness.distribution())
    state[control] = value
    await nextTick()
    assert.notEqual(JSON.stringify(harness.distribution()), before, control)
    assert.ok(theoreticalLeaderboard(harness.distribution(), [571]).length > 2)
  }
  harness.stop()
})

test('multiplicative variable model publishes live leaderboard distributions', async () => {
  const harness = modelHarness('FishVariableRollSumModel')
  harness.state.multiply = true
  await nextTick()
  const { state } = harness
  const original = harness.distribution()
  assert.equal(original.length, 2049)
  assert.ok(state.achievableRange.max > 200)
  assert.ok(state.codeSnippet.includes('for (let i = 0; i < rolls.length; i++)'))
  assert.ok(!state.codeSnippet.includes('reduce('))
  for (const [control, value] of Object.entries({ maxRolls: 8, previousLowerCutoff: 0.19,
    previousUpperCutoff: 0.83, unconditionalRolls: 3, offset: 1.1, square: true })) {
    const before = JSON.stringify(harness.distribution())
    state[control] = value
    await nextTick()
    assert.notEqual(JSON.stringify(harness.distribution()), before, control)
  }
  assert.ok(theoreticalLeaderboard(harness.distribution(), [571]).length > 2)
  harness.stop()
})

test('separate multiplied model updates its curve, mean and range with each bound', async () => {
  const harness = modelHarness('FishSeparateMultipliedModel')
  const { state } = harness
  assert.equal(harness.distribution().length, 2049)
  const initialMean = state.theoreticalMean
  assert.ok(Math.abs(initialMean - 104.5) < 1e-10)
  assert.ok(Math.abs(state.achievableRange.min - 27.648) < 1e-10)
  assert.ok(Math.abs(state.achievableRange.max - 250.992) < 1e-10)
  assert.match(state.codeSnippet, /averageSize \* r1 \* r2 \* r3/)
  for (const [control, value] of Object.entries({ min1: 0.45, max1: 1.6,
    min2: 0.55, max2: 1.45, min3: 0.75, max3: 1.25 })) {
    const before = JSON.stringify(harness.distribution())
    state[control] = value
    await nextTick()
    assert.notEqual(JSON.stringify(harness.distribution()), before, control)
  }
  assert.notEqual(state.theoreticalMean, initialMean)
  assert.ok(theoreticalLeaderboard(harness.distribution(), [571]).length > 2)
  harness.stop()
})

test('fixed and mixture models publish their current distribution too', async () => {
  const fixed = modelHarness('FishRollModel')
  const before = JSON.stringify(fixed.distribution())
  fixed.state.rollCount = 6
  await nextTick()
  assert.notEqual(JSON.stringify(fixed.distribution()), before)
  fixed.stop()

  const mixture = modelHarness('FishModel', 'modelC')
  mixture.state.curves = [{ amount: 1, kind: 'Uniform', center: 1, width: 0.4 }]
  await nextTick()
  assert.equal(mixture.state.sizeCdf(80), 0)
  assert.equal(mixture.state.sizeCdf(100), 0.5)
  assert.equal(mixture.state.sizeCdf(120), 1)
  assert.equal(mixture.distribution().length, 2049)
  mixture.state.loadPreset(0)
  await nextTick()
  assert.ok(mixture.distribution().at(-1)[1] > 1 - 1e-9)
  mixture.stop()
})
