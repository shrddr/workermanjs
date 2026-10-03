// CDF of the product of two independent, non-negative uniform variables.
export function uniformProductCdf(value, min1, max1, min2, max2) {
  if (value < 0) return 0

  const span1 = max1 - min1
  const span2 = max2 - min2
  if (span1 === 0 && span2 === 0) return value >= min1 * min2 ? 1 : 0
  if (span1 === 0) return min1 === 0 ? 1 : uniformCdf(value / min1, min2, max2)
  if (span2 === 0) return min2 === 0 ? 1 : uniformCdf(value / min2, min1, max1)

  if (value <= min1 * min2) return 0
  if (value >= max1 * max2) return 1

  // Integrate P(r2 <= value / r1) over the uniform range of r1.
  const fullEnd = Math.min(max1, value / max2)
  const fullLength = Math.max(0, fullEnd - min1)
  const partialStart = Math.max(min1, value / max2)
  const partialEnd = Math.min(max1, min2 === 0 ? Infinity : value / min2)
  let partialArea = 0
  if (partialEnd > partialStart) {
    partialArea = (
      value * Math.log(partialEnd / partialStart) -
      min2 * (partialEnd - partialStart)
    ) / span2
  }
  return Math.max(0, Math.min(1, (fullLength + partialArea) / span1))
}

function uniformCdf(value, min, max) {
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

// Integrate the exact two-factor CDF over a third independent uniform.
// Split at the two-factor CDF's support/formula boundaries so a small fixed
// Gauss-Legendre rule remains accurate even near the tails.
const GAUSS_NODES = [
  0.09501250983763744, 0.2816035507792589,
  0.4580167776572274, 0.6178762444026438,
  0.755404408355003, 0.8656312023878318,
  0.9445750230732326, 0.9894009349916499,
]
const GAUSS_WEIGHTS = [
  0.1894506104550685, 0.18260341504492358,
  0.16915651939500254, 0.14959598881657673,
  0.12462897125553387, 0.09515851168249278,
  0.06225352393864789, 0.027152459411754095,
]

export function uniformProduct3Cdf(value, min1, max1, min2, max2, min3, max3) {
  if (value < 0) return 0
  if (max1 === 0 || max2 === 0 || max3 === 0) return 1
  if (max3 === min3) {
    return min3 === 0
      ? 1
      : uniformProductCdf(value / min3, min1, max1, min2, max2)
  }
  if (value <= min1 * min2 * min3) return 0
  if (value >= max1 * max2 * max3) return 1

  const cuts = [min3, max3]
  for (const corner of [
    min1 * min2, min1 * max2, max1 * min2, max1 * max2,
  ]) {
    if (corner > 0) {
      const cut = value / corner
      if (cut > min3 && cut < max3) cuts.push(cut)
    }
  }
  cuts.sort((a, b) => a - b)

  let area = 0
  for (let i = 1; i < cuts.length; i++) {
    let start = cuts[i - 1]
    const end = cuts[i]
    // Keep each integration interval modest in ratio as well as width; the
    // zero-bounded case otherwise has a long 1/r3-shaped tail.
    while (start < end) {
      const next = start > 0 ? Math.min(end, start * 2) : end
      const halfWidth = (next - start) / 2
      const midpoint = (next + start) / 2
      for (let j = 0; j < GAUSS_NODES.length; j++) {
        const offset = halfWidth * GAUSS_NODES[j]
        area += halfWidth * GAUSS_WEIGHTS[j] * (
          uniformProductCdf(value / (midpoint - offset), min1, max1, min2, max2) +
          uniformProductCdf(value / (midpoint + offset), min1, max1, min2, max2)
        )
      }
      start = next
    }
  }
  return Math.max(0, Math.min(1, area / (max3 - min3)))
}
