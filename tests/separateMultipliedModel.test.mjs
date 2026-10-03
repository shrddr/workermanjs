import test from 'node:test'
import assert from 'node:assert/strict'
import { uniformProductCdf, uniformProduct3Cdf } from '../src/separateMultipliedModel.mjs'

test('product of two unit uniforms has the known CDF', () => {
  assert.equal(uniformProductCdf(0, 0, 1, 0, 1), 0)
  assert.equal(uniformProductCdf(1, 0, 1, 0, 1), 1)
  for (const value of [0.01, 0.1, 0.25, 0.5, 0.9]) {
    const expected = value * (1 - Math.log(value))
    assert.ok(Math.abs(uniformProductCdf(value, 0, 1, 0, 1) - expected) < 1e-12)
  }
})

test('positive bounds and fixed multipliers have correct support', () => {
  assert.equal(uniformProductCdf(0.3, 0.5, 1.5, 0.6, 1.4), 0)
  assert.equal(uniformProductCdf(2.1, 0.5, 1.5, 0.6, 1.4), 1)
  assert.equal(uniformProductCdf(1, 1, 1, 0.5, 1.5), 0.5)
  assert.equal(uniformProductCdf(0, 0, 0, 0.5, 1.5), 1)
  assert.equal(uniformProductCdf(1, 1, 1, 1, 1), 1)
})

test('CDF is monotone across the default model range', () => {
  let previous = 0
  for (let index = 0; index <= 1000; index++) {
    const value = 0.3 + 1.8 * index / 1000
    const probability = uniformProductCdf(value, 0.5, 1.5, 0.6, 1.4)
    assert.ok(probability >= previous - 1e-12)
    previous = probability
  }
})

test('product of three unit uniforms has the known CDF', () => {
  for (const value of [0.0001, 0.001, 0.01, 0.1, 0.25, 0.5, 0.9]) {
    const log = Math.log(value)
    const expected = value * (1 - log + log * log / 2)
    assert.ok(Math.abs(uniformProduct3Cdf(value, 0, 1, 0, 1, 0, 1) - expected) < 1e-10)
  }
})

test('a fixed third multiplier reduces to the two-factor model', () => {
  for (const value of [0.3, 0.6, 1, 1.5, 2.1]) {
    const expected = uniformProductCdf(value / 1.2, 0.5, 1.5, 0.6, 1.4)
    assert.equal(uniformProduct3Cdf(value, 0.5, 1.5, 0.6, 1.4, 1.2, 1.2), expected)
  }
})

test('a zero multiplier makes the product exactly zero', () => {
  assert.equal(uniformProduct3Cdf(-0.001, 0, 0, 0.5, 1.5, 0.8, 1.2), 0)
  assert.equal(uniformProduct3Cdf(0, 0, 0, 0.5, 1.5, 0.8, 1.2), 1)
})
