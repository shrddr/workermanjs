// Discretize log(product) so multiplying per-roll factors becomes convolution.
// Each roll's log-factor density has an integrable exponential shape; cumulative
// sums make every convolution linear in the number of output cells.
const LOG_STEP = 0.001

function factor(roll, denominator) {
  return 1 + (roll - 0.5) / denominator
}

function logFactor(roll, denominator) {
  return Math.log(Math.max(1e-5, factor(roll, denominator)))
}

function convolve(state, intervals, denominator) {
  const valid = intervals.filter(([a, b]) => b > a)
  if (!valid.length) return { origin: 0, masses: new Float64Array(0) }
  const minLog = Math.min(...valid.map(([a]) => logFactor(a, denominator)))
  const maxLog = Math.max(...valid.map(([, b]) => logFactor(b, denominator)))
  const lower = Math.floor((state.origin + minLog - LOG_STEP / 2) / LOG_STEP) * LOG_STEP - LOG_STEP
  const upper = Math.ceil((state.origin + (state.masses.length - 1) * LOG_STEP + maxLog + LOG_STEP / 2) / LOG_STEP) * LOG_STEP + LOG_STEP
  const length = Math.ceil((upper - lower) / LOG_STEP)
  const prefix = new Float64Array(state.masses.length + 1)
  const weighted = new Float64Array(prefix.length)
  for (let i = 0; i < state.masses.length; i++) {
    prefix[i + 1] = prefix[i] + state.masses[i]
    weighted[i + 1] = weighted[i] + state.masses[i] * Math.exp(-state.origin - i * LOG_STEP)
  }
  const indexAt = value => Math.max(0, Math.min(state.masses.length,
    Math.floor((value - state.origin) / LOG_STEP) + 1))
  const cdfAt = z => {
    let value = 0
    for (const [a, b] of valid) {
      const full = indexAt(z - logFactor(b, denominator))
      const partial = indexAt(z - logFactor(a, denominator))
      value += (b - a) * prefix[full] +
        denominator * Math.exp(z) * (weighted[partial] - weighted[full]) +
        (0.5 - denominator - a) * (prefix[partial] - prefix[full])
    }
    return value
  }
  const masses = new Float64Array(length)
  let previous = cdfAt(lower)
  for (let i = 0; i < length; i++) {
    const next = cdfAt(lower + (i + 1) * LOG_STEP)
    masses[i] = Math.max(0, next - previous)
    previous = next
  }
  return { origin: lower + LOG_STEP / 2, masses }
}

export function productDistribution({ unconditionalRolls, maxRolls, lower, upper, offset }) {
  const initial = Math.max(1, unconditionalRolls)
  const full = [[0, 1]]
  const middle = [[lower, upper]]
  const extremes = [[0, lower], [upper, 1]]
  const canStop = lower < upper
  const canContinue = lower > 0 || upper < 1
  const stops = []
  let totalMass = 0
  for (let count = initial; count <= maxRolls; count++) {
    if (count > initial && !canContinue) break
    if (count < maxRolls && !canStop) continue
    const denominator = offset + count / 2
    let state = { origin: 0, masses: Float64Array.of(1) }
    for (let roll = 1; roll <= count; roll++) {
      const intervals = roll < initial ? full :
        roll === count ? (count === maxRolls ? full : middle) : extremes
      state = convolve(state, intervals, denominator)
      if (!state.masses.length) break
    }
    if (!state.masses.length) continue
    const cdf = new Float64Array(state.masses.length + 1)
    for (let i = 0; i < state.masses.length; i++) cdf[i + 1] = cdf[i] + state.masses[i]
    const mass = cdf[cdf.length - 1]
    stops.push({ rollCount: count, origin: state.origin, cdf, mass })
    totalMass += mass
    if (totalMass > 1 - 1e-7) break
  }
  return { step: LOG_STEP, stops, totalMass }
}

export function productStopCdf(distribution, stop, multiplier) {
  if (!(multiplier > 0)) return 0
  const position = (Math.log(multiplier) - stop.origin) / distribution.step + 0.5
  if (position <= 0) return 0
  if (position >= stop.cdf.length - 1) return stop.mass
  const index = Math.floor(position)
  return stop.cdf[index] + (position - index) * (stop.cdf[index + 1] - stop.cdf[index])
}
