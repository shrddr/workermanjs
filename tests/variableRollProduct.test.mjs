import assert from 'node:assert/strict'
import test from 'node:test'
import { productDistribution, productStopCdf } from '../src/variableRollProduct.mjs'

const settings = { unconditionalRolls: 2, maxRolls: 7, lower: 0.24, upper: 0.76, offset: 1 }

test('multiplicative branch probabilities match the shared stopping rule', () => {
  const distribution = productDistribution(settings)
  assert.ok(Math.abs(distribution.totalMass - 1) < 1e-8)
  assert.deepEqual(distribution.stops.map(stop => stop.rollCount), [2, 3, 4, 5, 6, 7])
  for (const [index, stop] of distribution.stops.entries()) {
    const expected = index === 5 ? 0.48 ** 5 : 0.52 * 0.48 ** index
    assert.ok(Math.abs(stop.mass - expected) < 1e-8)
  }
})

test('product CDF agrees with a seeded simulation of the displayed rule', () => {
  const distribution = productDistribution(settings)
  const thresholds = [0.8, 1, 1.2, 1.5]
  const predicted = thresholds.map(value => distribution.stops.reduce(
    (sum, stop) => sum + productStopCdf(distribution, stop, value), 0,
  ) / distribution.totalMass)
  let seed = 8473
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32)
  const counts = thresholds.map(() => 0)
  const sampleCount = 100000
  for (let sample = 0; sample < sampleCount; sample++) {
    const rolls = []
    let roll
    do {
      roll = random()
      rolls.push(roll)
    } while ((rolls.length < 2 || roll <= 0.24 || roll >= 0.76) && rolls.length < 7)
    const denominator = 1 + rolls.length / 2
    const value = rolls.reduce((product, item) => product *
      (1 + (item - 0.5) / denominator), 1)
    thresholds.forEach((threshold, index) => { if (value <= threshold) counts[index]++ })
  }
  for (let index = 0; index < thresholds.length; index++)
    assert.ok(Math.abs(predicted[index] - counts[index] / sampleCount) < 0.006,
      `${thresholds[index]}: model ${predicted[index]}, simulated ${counts[index] / sampleCount}`)
})
