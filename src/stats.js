import { jStat } from 'jstat-esm';

export function makeUniformArray(mean, samples, bins, width) {
  let ret = []
  for (let k = 0; k <= bins; k++) {
    const binCenter = 0.5 + k
    const probability = jStat.uniform.pdf( binCenter, mean-width/2, mean+width/2 )
    const y = probability * samples
    if (y < 0.01) {
      continue
    }
    ret.push([k, y])
  }
  return ret
}

export function makeNormalArray(mean, samples, bins, stdDev) {
  let ret = []
  for (let k = 0; k <= bins; k++) {
    const binCenter = 0.5 + k
    const probability = jStat.normal.pdf( binCenter, mean, stdDev )
    const y = probability * samples
    if (y < 0.01) {
      continue
    }
    ret.push([k, y])
  }
  return ret
}

export function makeBinomialArray(mean, len, n, isGiant) {
  if (isGiant) return makeBinomialArrayGiant(mean, len, n)
  // binomial distribution
  //console.log('makeBinomialArray1', mean, len, n)
  const samples = len
  let ret = []
  for (let k = 0; k <= n; k++) {
    const probability = jStat.binomial.pdf( k, n, mean/n )
    if (probability < 0) {
      return null
    }
    const y = probability * samples
    //console.log('makeBinomialArray2', k, n, mean/n, probability, samples, y)
    if (y < 0.01) {
      continue
    }
    ret.push([k, y])
  }
  //console.log('makeBinomialArray3', ret)
  return ret
}

export function makeBinomialArrayGiant(mean, len, n) {
  // same but with giant bonus and zero filled gaps between
  const samples = len
  let ret = []
  let next_gk = 0
  for (let k = 0; k <= n; k++) {
    const probability = jStat.binomial.pdf( k, n, mean/n )
    if (probability < 0) {
      return null
    }
    const y = probability * samples
    if (y < 0.01) {
      continue
    }
    
    const gk = Math.floor(k * 1.684)
    if (next_gk) {
      for (let zfill = next_gk; zfill < gk; zfill++) {
        ret.push([zfill, 0])
      }
    }
    ret.push([gk, y])
    next_gk = gk + 1
  }
  return ret
}

export function makeBinomialArraysForGiant(Umean, Ulen, Lmean, Llen, n, useBonusForLucky) {
  // unlucky and lucky in one package
  let Uret = []
  let next_gk = 0
  for (let k = 0; k <= n; k++) {
    const probability = jStat.binomial.pdf( k, n, Umean/n )
    if (probability < 0) {
      Uret = null
      break
    }
    const y = probability * Ulen
    if (y < 0.01) {
      continue
    }
    
    const gk = Math.floor(k * 1.684)
    if (next_gk) {
      for (let zfill = next_gk; zfill < gk; zfill++) {
        Uret.push([zfill, 0])
      }
    }
    Uret.push([gk, y])
    next_gk = gk + 1
  }

  const luckyCyclesShare = Llen / Ulen
  const Ldict = {}
  
  for (let Lk = 0; Lk <= n; Lk++) {
    const Lprobability = jStat.binomial.pdf( Lk, n, Lmean/n )
    if (Lprobability < 0) {
      throw Error(`invalid arguments for Stat.binomial.pdf: ${Lk}, ${n}, ${Lmean/n}`)
    }
    const Ly = Lprobability * Llen
    if (Ly < 0.01) {
      continue
    }
    const actual_Lk = useBonusForLucky ? Math.floor(Lk * 1.684) : Lk
    // each point of Lk is a scaled down copy of whole Uret
    Uret.forEach(Uky => {
      const [Uk, Uy] = Uky
      const k = Uk + actual_Lk
      const y = Uy * Lprobability * luckyCyclesShare
      if (k in Ldict) {
        Ldict[k] += y
      }
      else {
        Ldict[k] = y
      }
    })
    //console.log('Lk', Lk, Lprobability, 'Ly', Ly, Ldict)
  }

  let min_k = 99
  let max_k = 0
  for (const [sk, y] of Object.entries(Ldict)) {
    if (y < 0.01) continue
    const k = parseInt(sk)
    if (k < min_k) min_k = k
    if (k > max_k) max_k = k
  }
  
  const Lret = []
  for (let k = min_k; k <= max_k; k++) {
    if (k in Ldict) {
      const y = Ldict[k]
      Lret.push([k, y])
    }
    else {
      Lret.push([k, 0])
    }
  }
  //const Lret = Object.entries(Ldict).map(([k, y]) => [parseInt(k), y]).filter(([k, y]) => y > 0.1)
  const ret = {bellU: Uret, bellL: Lret}
  //console.log(ret)
  return ret
}

export function sumDistributions(a, b) {
  let map = {}
  if (a) {
    for (let [x, y] of a) {
      map[x] = y
    }
  }
  for (let [x, y] of b) {
    if (x in map)
      map[x] += y
    else
      map[x] = y
  }
  let s = Object.entries(map).sort((a, b) => a[0]-b[0])
  let ret = []
  for (let [k, v] of s)
    ret.push([
      k, 
      v, 
      //`${k}: ${v.toFixed(3)} samples`
    ])
  return ret
}

export function loss(bell, histMap, variables, usePooling, discardBin0) {
  if (usePooling) throw Error('not implemented')
  return lossDiscarded(bell, histMap, variables, discardBin0)
}

function lossDiscarded(model, observed, variables, discardBin0) {
  let mse = undefined
  let chisq = undefined
  let pval = undefined
  if (!Object.keys(model).length) return {mse, chisq, pval}
  
  mse = 0
  for (const [_, [sx, y_model]] of Object.entries(model)) {
    const x = parseInt(sx)
    if (discardBin0 && x == 0) continue
    const y_observed = x in observed ? observed[x] : 0
    const y_delta = y_model - y_observed
    //console.log(x, y_observed, y_model, y_delta)
    mse += y_delta * y_delta
  }
  //console.log('mse', mse)

  const beginDiscardingValue = 3
  const stopDiscardingBinCount = variables + 2
  //by y_model from high to low
  const sortedkeys = Object.keys(model).sort((a,b) => model[b][1]-model[a][1])
  let discarded = {}
  let bin_count = 0
  sortedkeys.forEach(i => {
    const x = model[i][0]
    if (discardBin0 && x == '0') return
    const y_model = model[i][1]
    const y_observed = x in observed ? observed[x] : 0
    if ((y_model >= beginDiscardingValue || y_observed >= beginDiscardingValue) || bin_count < stopDiscardingBinCount) {
      discarded[x] = { y_model, y_observed }
      bin_count++
    }
  })

  
  const discLen = Object.keys(discarded).length
  if (discLen == 0) {
    console.log("can't compute chiSquared: only", discarded, "bins left after discard")
    return {mse, chisq, pval}
  }

  // discard done, calculate χ² and p-value
  let bins = 0
  chisq = 0
  for (const [x, {y_model, y_observed}] of Object.entries(discarded)) {
    const y_delta = y_model - y_observed
    chisq += y_delta * y_delta / y_model
    //console.log(`chisq bin ${x} ${y_delta} =${chisq}`)
    bins++
  }

  // TODO: if bins < variables + 1, use some other exact method (fisher's? repeated binomtest?)
  if (bins - 1 - variables < 1) {
    console.log("can't compute pval: bins", bins, "variables", variables)
    return {mse, chisq, pval}
  }
  
  if (isFinite(chisq)) {
    pval = 1 - jStat.chisquare.cdf(chisq, bins - 1 - variables)
  }
  else {
    pval = 0
  }
  //console.log('stats.loss', chisq, bins, pval)
  return {mse, chisq, pval}
}

export function applyGiantBonus(arr) {
  arr.forEach(kv => {
    kv[0] = Math.floor(kv[0] * 1.684)
  })
}