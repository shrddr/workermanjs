// Replay one species in input order, starting with an empty ten-slot leaderboard.
export function leaderboardAnnouncements(catches) {
  const top = []
  const announcements = []
  for (const size of catches) {
    if (!Number.isFinite(size)) continue
    // Once full, a tie with the smallest entry does not change the leaderboard.
    if (top.length === 10 && size <= top[9]) continue

    announcements.push(size)
    const position = top.findIndex(entry => size > entry)
    if (position === -1) top.push(size)
    else top.splice(position, 0, size)
    if (top.length > 10) top.pop()
  }
  return announcements
}

const expectedTotals = new Map()

function expectedTotal(count) {
  if (!expectedTotals.has(count)) {
    let total = Math.min(10, count)
    for (let index = 11; index <= count; index++) total += 10 / index
    expectedTotals.set(count, total)
  }
  return expectedTotals.get(count)
}

// For M catches above a threshold, expected updates are sum(min(1, 10/i), i=1..M).
// M is Binomial(count, tailProbability); this averages over random catch orders.
export function expectedLeaderboardUpdates(count, tailProbability) {
  const p = Math.max(0, Math.min(1, tailProbability))
  if (!(count > 0) || !(p > 0)) return 0
  if (count <= 10) return count * p
  if (p === 1) return expectedTotal(count)
  const mean = count * p
  // E[H_M] = H_count + log(p), apart from an exponentially small remainder.
  // Above mean 50, that remainder and the M < 10 correction are negligible.
  if (mean > 50) return expectedTotal(count) + 10 * Math.log(p)

  const logP = Math.log(p)
  const logQ = Math.log1p(-p)
  let logProbability = count * logQ
  let updates = 0
  let expected = 0
  for (let m = 0; m <= count; m++) {
    const probability = Math.exp(logProbability)
    expected += probability * updates
    if (m > mean && probability < 1e-14) break
    logProbability += Math.log(count - m) - Math.log(m + 1) + logP - logQ
    updates += Math.min(1, 10 / (m + 1))
  }
  return expected
}

// Snapshot the current model CDF without exposing a mutable child component.
export function sampleSizeDistribution(cdf, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return []
  const points = []
  let probability = 0
  for (let index = 0; index <= 2048; index++) {
    const size = min + (max - min) * index / 2048
    const value = cdf(size)
    if (!Number.isFinite(value)) return []
    probability = Math.max(probability, Math.min(1, Math.max(0, value)))
    points.push([size, probability])
  }
  return points
}

export function theoreticalLeaderboard(distribution, speciesCounts) {
  const counts = new Map()
  for (const count of speciesCounts) {
    if (count > 0) counts.set(count, (counts.get(count) || 0) + 1)
  }
  if (!counts.size) return []
  const result = []
  for (const [size, probability] of distribution) {
    let expected = 0
    for (const [count, frequency] of counts) {
      expected += frequency * expectedLeaderboardUpdates(count, 1 - probability)
    }
    const previous = result[result.length - 1]
    if (expected < 1) {
      // End at the chart's lower Y bound without plotting log(0).
      if (previous && previous[1] > 1) {
        const fraction = (previous[1] - 1) / (previous[1] - expected)
        result.push([previous[0] + fraction * (size - previous[0]), 1])
      }
      break
    }
    result.push([size, expected])
  }
  return result
}
