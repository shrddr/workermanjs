import {defineStore} from "pinia";
import {useGameStore} from './game'
import {useMarketStore} from './market'
import {useRoutingStore} from './routing'
import {searchSorted, formatFixed, hoursToHMS} from '../util.js'
import { MapJobWagon } from "../types/all.ts";

export const useUserStore = defineStore({
  id: "user",
  state: () => ({
    selectedLang: 'en',
    selectedRegion: 'RU',
    selectedTax: 0.65,
    customPrices: {},
    keepItems: {},
    regionResources: {},
    allowFloating: false,
    useFloatingResources: {},
    regionResources2: {},
    
    lodgingP2W: {},
    storageP2W: {},
    storageVP: false,
    storagePersonal: {},
    lodgingTaken: {},
    activateAncado: false,
    houseTaken: {},

    userWorkers: [],
    useDefaultWorker: false,
    defaultWorker: {
      tnk: 0,
      charkey: 7572,
      label: 'default',
      level: 30,
      wspdSheet: 140,
      mspdSheet: 7.5,
      luckSheet: 6,
      skills: ["1012", "1301", "1302", "1303", "1601", "1602", "1603"],
      job: null,
    },
    farmingEnable: false,
    farmingBareProfit: 0,
    farmingProfit: 0,
    farmingP2WShare: 0,
    displayWorkerNames: true,
    displayWorkerStatsRank: false,
    displayWorkerStatsForPz: true,
    displayProfitPerCp: false,

    grindTakenList: [],
    grindTakenValues: {},
    userWorkshops: {},
    defaultUserWorkshop: {
      industry: 'unknown',
      label: '',
      manualCycleIncome: 0,
      manualWorkload: 300,
      manualCp: 1
    },
    
    mapHideInactive: 0,
    mapIconSize: 30,
    wasmRouting: false,

    palaceEnable: false,
    palaceProfit: 0,

    tradeDestinations: {},
    tradeRouteOn: {},
    tradeRouteAlwaysOn: {},
    tradeInfraCp: {},
    //tradeRouteCp: {},
    tradingLevel: 91,

    strictPriority: false,  // false = share, true = order by category
    linkOrder: [
      { name: 'grind', id: 1 },
      { name: 'worker', id: 2 },
      { name: 'wagon', id: 3 },
    ],

    wasm: {
      tryMoreFrontierRings: false,
      debugMoreFrontierRings: false,
    },

    pcHours: 16,
  }),
  actions: {
  
    migrate(localStored) {
      if (!localStored) return

      const parsed = JSON.parse(localStored)
      let updated = false

      if ('counter' in parsed) {
        delete parsed.counter
        updated = true
      }

      if ('connectionOrder' in parsed) {
        delete parsed.connectionOrder
        updated = true
      }

      if ('townSlotsP2W' in parsed) {
        parsed.lodgingP2W = parsed.townSlotsP2W
        delete parsed.townSlotsP2W
        updated = true
      }

      if ('grindTaken' in parsed) {
        parsed.grindTakenList = Object.entries(parsed.grindTaken)
          .filter(([key, value]) => value === true)
          .map(([key, value]) => Number(key))
        delete parsed.grindTaken
        updated = true
      }

      if ('userWorkers' in parsed) {
        // event node
        parsed.userWorkers.forEach(w => {
          if (w.job == 1049) {
            w.job = null
            updated = true
          }
        })
      }

      if ('grindTakenList' in parsed) {
        const badSet = new Set([133, 134, 612, 805, 806, 807, 801, 961, 962, 963, 1643, 1644])
        const cleanList = parsed.grindTakenList.filter(n => !(badSet.has(n)))
        if (parsed.grindTakenList.length > cleanList.length) {
          parsed.grindTakenList = cleanList
          updated = true
        }
      }

      if ('userWorkers' in parsed) {
        parsed.userWorkers.forEach(w => {
          if (typeof(w.job) == 'number') {
            const pzk = w.job
            w.job = { kind: 'plantzone', pzk, storage: w.tnk }
            updated = true
          }
          else if (w?.job?.kind === 'plantzone') {
            // 2025-03-23 there was a bad push which allowed creating a plantzone job with no storage
            if (!('storage' in w.job)) {
              w.job.storage = w.tnk
              updated = true
            }
          }
          // update custom job format
          if (Array.isArray(w.job)) {
            w.job = { kind: 'custom', profit: w.job[1], cp: w.job[2], label: w.job[3]}
          }
        })
      }

      if ('farmingP2W' in parsed) {
        parsed.farmingP2WShare = parsed.farmingP2W ? 80 : 0
        delete parsed.farmingP2W
        updated = true
      }

      if ('regionModifiers' in parsed) {
        parsed.regionResources = parsed.regionModifiers
        delete parsed.regionModifiers
      }
      if ('useFloatingModifiers' in parsed) {
        parsed.useFloatingResources = parsed.useFloatingModifiers
        delete parsed.useFloatingModifiers
      }
      if ('regionModifiers2' in parsed) {
        parsed.regionResources2 = parsed.regionModifiers2
        delete parsed.regionModifiers2
      }
      if (parsed?.defaultUserWorkshop?.manualCp == 0) {
        parsed.defaultUserWorkshop.manualCp = 1
      }

      if (updated) {
        localStorage.setItem('user', JSON.stringify(parsed))
        console.log('userStore updated to new version')
      }

      this.$patch(parsed)
    },

    removeNodeTaken(nk) {
      const gameStore = useGameStore()
      const requiredNodes = new Set()
      this.workingWorkers.forEach(w => {
        const workPath = gameStore.dijTakenOnlyPath(tnk, w.job)
        workPath.forEach(n => requiredNodes.add(n))
      })
      if (requiredNodes.has(nk)) {
        console.log("can't remove required node")
        return false
      }
      this.nodesTaken[nk] = false
      console.log("removed")
      return true
    },
    assignWorker(worker, job) {
      console.log('assigning', worker.label, 'to', worker.job)
      if (job?.kind == 'plantzone' && job.storage == undefined) throw Error('storage undefined')
      var fromIndex = this.userWorkers.indexOf(worker)
      //console.log('fromIndex', fromIndex)
      this.userWorkers.splice(fromIndex, 1)
      this.userWorkers.push(worker)
      worker.job = job
    },

    // --------- floating resource related

    chanceAtResource(rgk, mod) {
      if (mod == 0)
        return 100
      const gameStore = useGameStore()
      if (!(gameStore.ready))
        return 0
      // if mod is a known dict key, return corresponding time(mod)
      if (this.modTimes[rgk].hasOwnProperty(mod)) return this.modTimes[rgk][mod]
      // otherwise, lerp between nearest known time(a) and time(b)
      // a ---- mod -- b
      if (this.modSorteds[rgk] === undefined)
        console.log('undefined resource% at rgk', rgk)
      const pos_a = searchSorted(this.modSorteds[rgk], mod)
      //console.log(mod, pos_a)
      const pos_b = pos_a + 1
      if (pos_a === -1) return 100
      const size = this.modSorteds[rgk].length
      if (pos_a === size) return 0
      const mod_a = this.modSorteds[rgk][pos_a]
      const time_a = this.modTimes[rgk][mod_a]
      //console.log('chanceAtResource', mod, pos_a, pos_b)
      if (pos_a == pos_b) return time_a
      const mod_b = this.modSorteds[rgk][pos_b]
      const time_b = this.modTimes[rgk][mod_b]
      const lerp_factor = (mod - mod_a) / (mod_b - mod_a)
      const time = time_a + lerp_factor * (time_b - time_a)
      //console.log(mod, mod_a, mod_b, lerp_factor, time_a, time_b, time)
      return time
    },

    tierResources(rgk, baseWorkload, wspd) {
      const ret = []
      let prev_tier_time = 0
      const wld_lo = baseWorkload
      const wld_hi = 2 * wld_lo
      const tier_best = Math.ceil(wld_lo / wspd)  // tier = number of 10-minute chunks
      const tier_worst = Math.ceil(wld_hi / wspd)
      for (let tier = tier_best; tier <= tier_worst; tier++) {
        //wspd * tier = activewld = wld * (2 - mod)
        const mod = Math.max(2 - wspd * tier / wld_lo, 0)
        const wld = Math.floor(wld_lo * (2 - mod) / 100) * 100  // floor to prevent 770.0000000000001
        const time = this.chanceAtResource(rgk, mod*100)
        //console.log(`w < ${wld.toFixed(2)}, mod > ${mod.toFixed(3)} -> tier ${tier}, time ${time}`)
        if (time == 0) continue
        ret.push({wld, mod, tier, time: time - prev_tier_time})
        prev_tier_time = time
      }
      //console.log(rgk, baseWorkload, wspd, 'tierResources', ret.length)
      return ret
    },

    calcWalkMinutes(dist, mspd) {
      return 2 * dist / mspd / 60
    },
    
    calcCyclesDaily(baseWorkload, rgk, wspd, dist, mspd) {
      let ret = 0
      const moveMinutes = this.calcWalkMinutes(dist, mspd)
      if (this.allowFloating && this.useFloatingResources[rgk]) {
        for (const r of this.tierResources(rgk, baseWorkload, wspd)) {
          const workMinutes = Math.ceil(r.wld / wspd)
          const cycleMinutes = 10 * workMinutes + moveMinutes

          //if (wspd == 153 || wspd == 154) 
          //  console.log('+', r.time, cycleMinutes, r.wld, wspd)

          ret += 24 * 60 * r.time / 100 / cycleMinutes
        }
      }
      else {
        const activeWorkload = baseWorkload * (2 - this.productivity(rgk))
        const workMinutes = Math.ceil(activeWorkload / wspd)
        const cycleMinutes = 10 * workMinutes + moveMinutes
        ret = 24 * 60 / cycleMinutes
        //console.log('cycleMinutes', ret)
      }
      //console.log(baseWorkload, this.useFloatingResources[rgk], wspd, dist, mspd, 'cycleMinutes', ret)
      
      return ret
    },

    modifyGrindTakens(e, nk) {
      const newSet = new Set(this.grindTakenSet)
      if (e.target.checked) {
        newSet.add(nk)
      }
      else {
        newSet.delete(nk)
      }
      this.grindTakenList = [...newSet]
      if (!this.grindTakenValues[nk]) {
        this.grindTakenValues[nk] = 50
      }
    },

    workerLabel(w) {
      let ret = this.displayWorkerNames ? w.label : ''
      const gameStore = useGameStore()
      if (gameStore && gameStore.ready) {
        ret += gameStore.speciesIcons[gameStore.workerStatic[w.charkey].species]
      }
      ret += w.level
      return ret
    },

    getUserWorkshop(hk) {
      if (!(hk in this.userWorkshops)) {
        this.userWorkshops[hk] = { ...this.defaultUserWorkshop }
        //console.log('created', this.userWorkshops[hk])
      }
      return this.userWorkshops[hk]
    },

    workerIncomePerCp(w) {
      const income = this.workerIncome(w)
      const sharedConn = this.workerSharedConnectionCP(w)
      const sharedLodgage = this.workerSharedLodgageCP(w).value
      const ret = income / (sharedConn + sharedLodgage)
      if (isNaN(ret)) 
        console.log(`workerIncomePerCp: ${formatFixed(income, 2)} / (${formatFixed(sharedConn, 2)} + ${formatFixed(sharedLodgage, 2)}) = ${formatFixed(ret, 2)} for worker ${w.label}`)
      return ret
    },

    workerIncome(w) {
      const gameStore = useGameStore()
      const routingStore = useRoutingStore()
      if (gameStore.jobIsIdle(w.job))
        return 0
      if (!routingStore.pzJobs)
        return 0
      if (gameStore.jobIsPz(w.job)) {
        if (routingStore.pzJobs[w.job.pzk] == undefined) {
          throw Error(`pzjob ${w.job.pzk} is undefined`)
        }
        return routingStore.pzJobs[w.job.pzk].profit.priceDaily
      }
      if (gameStore.jobIsFarming(w.job))
        return this.farmingProfitPerWorker
      if (gameStore.jobIsCustom(w.job))
        return w.job.profit
      if (gameStore.jobIsWorkshop(w.job)) {
        const hk = w.job.hk
        const workshop = this.getUserWorkshop(hk)
        const profit = gameStore.profitWorkshopWorker(hk, workshop, w).priceDaily
        return profit
      }
      return undefined
    },

    workerSharedConnectionCP(w) {
      let ret = undefined
      const gameStore = useGameStore()
      if (gameStore.jobIsPz(w.job)) {
        const routingStore = useRoutingStore()
        ret = routingStore.pzjobsSharedConnectionCP[w.job.pzk].value
      }
      if (gameStore.jobIsFarming(w.job))
        ret = 0
      if (gameStore.jobIsCustom(w.job))
        ret = w.job.cp
      if (gameStore.jobIsWorkshop(w.job)) {
        const workersAtWorkshop = this.workersWorkshop.filter(ww => ww.job.hk == w.job.hk).length
        ret = this.getUserWorkshop(w.job.hk).manualCp / workersAtWorkshop
      }
      //console.log(`workerSharedConnectionCP ${w.label} = ${ret}`)
      return ret
    },

    workerSharedLodgageCP(w) {
      const ret = {
        value: undefined,
        tooltip: '?'
      }
      const gameStore = useGameStore()
      if (!gameStore.ready)
        return ret
      const income = this.workerIncome(w)
      const tk = gameStore.tnk2tk(w.tnk)
      const townInfraCp = this.townsInfra[tk].cost  // lodging for pz+ws + storage for pz+personal
      
      const townTotalWorkers = this.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk).length
      const townTotalIncome = this.townsTotalIncome[tk].income

      if (this.townsTotalIncome[tk].hasNegativeJob || townTotalIncome == 0)  {
        ret.value = townInfraCp / townTotalWorkers
        ret.tooltip = `= total lodgage costs of hometown shared equally between all active jobs from that town:\n` +
        `${townInfraCp}CP / ${townTotalWorkers}`
      }
      else {
        if (townTotalWorkers == 1) {
          ret.value = townInfraCp
          ret.tooltip = `= all costs of ${gameStore.nodeName(w.tnk)} lodgage`
        }
        else {
          ret.value = townInfraCp * (income / townTotalIncome)
          ret.tooltip = `= total lodgage costs of hometown shared proportionally between all active jobs from that town:\n` +
          `${townInfraCp}CP * (${formatFixed(income, 3)} / ${formatFixed(townTotalIncome, 3)})`
        }
      }
      return ret
    },

  },

  getters: {
    grindTakenSet(state) {
      const s = new Set(state.grindTakenList)
      console.log('grindTakenSet getter', s)
      return s 
    },

    marketUrl: (state) => `https://apiv2.bdolytics.com/${state.selectedLang}/${state.selectedRegion}/market/central-market-data`,
    codexNodeUrl: (state) => `https://bdolytics.com/${state.selectedLang}/${state.selectedRegion}/db/node/`,
    itemUrl: (state) => `https://bdolytics.com/${state.selectedLang}/${state.selectedRegion}/db/item/`,
    
    // --------- floating resource related

    floatingRegionGroups() {
      const gameStore = useGameStore()
      const ret = Object.keys(gameStore.regionGroups).filter(rgk => this.useFloatingResources.hasOwnProperty(rgk) && this.useFloatingResources[rgk])
      //console.log('floatingRegionGroups', ret)
      return ret
    },
    modHists() {
      const ret = {}
      const gameStore = useGameStore()
      for (const rgk of Object.keys(gameStore.regionGroups)) {
        if (this.regionResources.hasOwnProperty(rgk)) {
          ret[rgk] = [this.regionResources[rgk]]
        }
        else {
          ret[rgk] = [0]
        }
      }
      for (const rgk of this.floatingRegionGroups) {
        if (!(this.regionResources2.hasOwnProperty(rgk))) {
          this.regionResources2[rgk] = [0]
        }
        // [0, 50, 0] -> [50, 0, 0]
        const sorted = this.regionResources2[rgk]
          //.split(',')
          .map(Number)
          .filter(v => !isNaN(v))
          .sort((a,b)=>b-a)
        //console.log(sorted)
        ret[rgk] = sorted
      }
      //console.log('modHists', ret)
      return ret
    },
    medianResources() {
      const ret = {}
      for (const [rgk, histo] of Object.entries(this.modHists)) {
        let mod = 0
        const pos = histo.length
        if (pos % 2) {
          mod = histo[(pos-1)/2]
        }
        else {
          const modA = histo[(pos-1-1)/2]
          const modB = histo[(pos-1+1)/2]
          mod = (modA+modB)/2
        }
        ret[rgk] = mod
      }
      //console.log('medianResources', ret)
      return ret
    },
    medianWorkloads() {
      const ret = {}
      const gameStore = useGameStore()
      for (const [pzk, pzd] of Object.entries(gameStore.plantzones)) {
        const rgk = pzd.regiongroup
        ret[pzk] = pzd.workload * (2 - this.medianResources[rgk]/100)
      }
      //console.log('medianWorkloads', ret)
      return ret
    },
    modTimes() {
      const average = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;
      const ret = {}
      const gameStore = useGameStore()
      for (const rgk of Object.keys(gameStore.regionGroups)) {
        // [50, 0, 0] Resources -> {50 mod: 33% time, 0 mod: 100% time}
        const size = this.modHists[rgk].length
        const times = {}
        // from leftmost cluster, take rightmost pos
        // from inner clusters, take average
        // from rightmost cluster, take leftmost pos
        const modBest = this.modHists[rgk][0]
        const modWorst = this.modHists[rgk][size-1]
        const singleCluster = modBest == modWorst
        if (singleCluster) {
          times[modBest] = (size-1)/2
        }
        else { // at least there are leftmost and rightmost
          const positions = {}
          for (let i=0; i<size; i++) {
            const mod = this.modHists[rgk][i]
            if (mod == modBest) {
              // leftmost - rewrite going right
              times[mod] = 100 * i / (size-1)
              continue
            }
            if (mod == modWorst) {
              // rightmost - save once and leave
              times[mod] = 100 * i / (size-1)
              break
            }
            // inner [optional] - average later
            if (mod in positions)
              positions[mod].push(i)
            else
              positions[mod] = [i]
          }
          
          for (const [mod, poss] of Object.entries(positions)) {
            const avePos = average(poss)
            times[mod] = 100 * avePos / (size-1)
          }
        }
          
        
        //console.log('times', times)
        ret[rgk] = times
      }
      //console.log('modTimes', ret[5])
      return ret
    },

    modSorteds() {
      const ret = {}
      const gameStore = useGameStore()
      for (const rgk of Object.keys(gameStore.regionGroups)) {
        const sorted = Object.keys(this.modTimes[rgk]).map(Number).sort((a,b)=>a-b)
        ret[rgk] = sorted
      }
      //console.log('modSorteds', ret)
      return ret
    },

    // ---------

    productivity: (state) => (rgr) => {
      const prod = rgr in state.regionResources ? state.regionResources[rgr] : 0
      return prod / 100
    },

    nodeCostInfinityUntaken: (state) => (nk) => {
      return state.autotakenNodes.has(nk) ? 0 : +Infinity
    },

    haveLodging (state) {
      const gameStore = useGameStore()

      let ret = {
        slots: {
          perTown: {},
          total: 0,
        },
        cp: {
          perTown: {},
          total: 0,
        }
      }
      
      for (const [tk, lodgingInfo] of Object.entries(gameStore.lodgingPerTown)) {
        ret.slots.perTown[tk] = 1  // base beds
        ret.cp.perTown[tk] = 0

        if (tk == 619 && !state.activateAncado) {
          ret.slots.perTown[tk] = 0
          continue
        }
        
        lodgingInfo.houses.forEach(house => {
          if (state.lodgingTaken[house.key]) {
            ret.slots.perTown[tk] += house.lodgingSpaces
            ret.cp.perTown[tk] += house.CP
          }
        })
        if (state.lodgingP2W[tk])
          ret.slots.perTown[tk] += state.lodgingP2W[tk]
        ret.slots.total += ret.slots.perTown[tk]
        ret.cp.total += ret.cp.perTown[tk]
      }
      console.log('haveLodging getter')
      return ret
    },

    townFreeLodgingCount: (state) => (tk) => {
      const gameStore = useGameStore()
      const total = state.haveLodging.slots.perTown[tk]
      const occupied = state.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk).length
      return total - occupied
    },

    countWorkers(state) {
      return state.userWorkers.length
    },

    workingWorkers(state) {
      return state.userWorkers.filter(w => w.job && w.job != null)
    },

    townWorkers: (state) => (tk) => {
      const gameStore = useGameStore()
      const ret = state.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk)
      //console.log('townWorkers', tk, ret)
      return ret
    },

    townWorkingWorkers: (state) => (tk) => {
      const gameStore = useGameStore()
      const ret = state.workingWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk)
      //console.log('townWorkingWorkers', tk, ret)
      return ret
    },
    
    getFreeWorkers: (state) => (tk) => {
      const gameStore = useGameStore()
      return state.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk && !w.job)
    },

    workerStatsForDisplay: (state) => (w) => {
      if (state.displayWorkerStatsRank) {
        const gameStore = useGameStore()
        const rank = gameStore.workerStatRank(w)
        return {
          wspd: rank.wspd_rank * 100,
          mspd: rank.mspd_rank * 100,
          luck: rank.luck_rank * 100,
        }
      }
      else {
        if (state.displayWorkerStatsForPz) {
          const gameStore = useGameStore()
          return gameStore.workerStatsOnCurrentJob(w)
        }
        else
          return {
            wspd: w.wspdSheet,
            mspd: w.mspdSheet,
            luck: w.luckSheet,
          }
      }
      
    },

    workersMinMaxStats(state) {
      console.log('workersMinMaxStats')
      const ret = { 
        wspd: { lo: 142, hi: 143 },
        mspd: { lo: 7.4, hi: 7.6 },
        luck: { lo: 10, hi: 11 },
      }
      state.userWorkers.forEach(w => {
        if (w.charkey == 7572) {
          const stats = state.workerStatsForDisplay(w)
          ret.wspd.lo = Math.min(stats.wspd, ret.wspd.lo)
          ret.mspd.lo = Math.min(stats.mspd, ret.mspd.lo)
          ret.luck.lo = Math.min(stats.luck, ret.luck.lo)
          ret.wspd.hi = Math.max(stats.wspd, ret.wspd.hi)
          ret.mspd.hi = Math.max(stats.mspd, ret.mspd.hi)
          ret.luck.hi = Math.max(stats.luck, ret.luck.hi)
        }
      })
      return ret
    },

    grindTakenDesc(state) {
      let ret = ""
      const gameStore = useGameStore()
      if (gameStore.ready) {
        state.grindTakenList.forEach(pzk => {
          ret += gameStore.uloc.node[pzk] + '\n'
        })
      } 
      return ret
    },

    pzjobsSharedEfficiency(state) {
      const ret = {}
      const routingStore = useRoutingStore()
      for (const [pzk, mapJob] of Object.entries(routingStore.pzJobs)) {
        if (mapJob.route.usedPath) {
          ret[pzk] = mapJob.profit.priceDaily / state.pzjobsSharedConnectionCP[pzk]
        }
      }
      //console.log('pzjobsSharedEfficiency', ret)
      return ret
    },

    pzjobsSortedSharedEfficiency(state) {
      return Object.entries(state.pzjobsSharedEfficiency).sort(([,a],[,b]) => b-a)
    },

    farmingProfitPerWorker(state) {
      return (state.farmingProfit - state.farmingBareProfit) / 10
    },

    

    newWorkerName: (state) => (tk) => {
      const gameStore = useGameStore()
      const townName = gameStore.uloc.town[tk]
        .replace('Город ', '')
        .replace('Деревня ', '')
        .substring(0, 3)
      const numberInTown = state.townWorkers(tk).length + 1
      return townName+numberInTown
    },

    workerBringsItemkeys: (state) => (w) => {
      const gameStore = useGameStore()
      if (gameStore.jobIsIdle(w.job))
        return []
      if (gameStore.jobIsPz(w.job))
        return gameStore.plantzones[w.job].itemkeys
      if (gameStore.jobIsFarming(w.job))
        return []
      if (gameStore.jobIsCustom(w.job))
        return [] // should be entered manually?
      if (gameStore.jobIsWorkshop(w.job)) {
        return [] // TODO: determine from exchangeKey
      }
      return undefined
    },

    townsStoreItemkeys(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      gameStore.townsWithRedirectableStorage.forEach(tnk => ret[gameStore.tnk2tk(tnk)] = new Set([]))
      //console.log('townsStoreItemkeys::ret', ret)
      state.workingWorkers.forEach(w => {
        if (gameStore.jobIsPz(w.job)) {
          const tk = gameStore.tnk2tk(w.job.storage)
          //console.log('townsStoreItemkeys::tk', tk)
          ret[tk] = new Set([...ret[tk], ...gameStore.plantzones[w.job.pzk].itemkeys])
        }
      })
      //console.log('townsStoreItemkeys', ret)
      return ret
    },

    baseStorage(state) {
      let ret = 16
      if (state.selectedRegion == 'RU') ret = 8
      if (state.selectedRegion == 'SEA') ret = 8
      if (state.selectedRegion == 'MENA') ret = 8
      return ret + (state.storageVP ? 16 : 0)
    },

    townInfra: (state) => (tk, l, s) => {
      // best way to achive 
      // `l` lodging (for plantzones and workshops)
      // and 
      //`s` storage slots (for plantzones only for now)
      // at town `tk` with current user settings
      const gameStore = useGameStore()
      if (!(tk in state.lodgingP2W))
        state.lodgingP2W[tk] = 0
      if (!(tk in state.storageP2W))
        state.storageP2W[tk] = 0
      if (!(tk in state.storagePersonal))
        state.storagePersonal[tk] = 0
      const wantLodging = l
        - state.lodgingP2W[tk]
        - 1
      const wantStorage = s + (s > 0 ? 1 : 0)
        + state.storagePersonal[tk]
        - state.storageP2W[tk]
        - state.baseStorage
        //- (tk == 955 ? 3 : 0)  // oddy
      //if (tk==1553) debugger
      const best = gameStore.lsLookup(tk, wantLodging, wantStorage)
      return best
    },

    townInfraAddCost: (state) => (lodgingTk, dl, itemkeys, storageTk) => {
      // cost and specifics of adding `dl` additional lodging slots 
      // and storage for additional `itemkeys` to town `storageTk` with current user settings;
      // if `storageTk` is undefined, search for cheapest town

      //console.log('townInfraAddCost', lodgingTk, dl, itemkeys, storageTk)
      if (storageTk && lodgingTk == storageTk) {
        const tk = lodgingTk  
        const oldInfra = state.townsInfra[tk]
        const newStorage = new Set([...state.townsStoreItemkeys[tk], ...itemkeys]).size
        const newInfra = state.townInfra(tk, state.townWorkingWorkers(tk).length+dl, newStorage)
        const gameStore = useGameStore()
        const infraTooltip = gameStore.uloc.town[tk] + ` housing:\nold: ${Math.max(0, oldInfra.wantLodging)}🛏️ + ${Math.max(0, oldInfra.wantStorage)}📦 = ${formatFixed(oldInfra.cost)} CP\nnew: ${Math.max(0, newInfra.wantLodging)}🛏️ + ${Math.max(0, newInfra.wantStorage)}📦 = ${formatFixed(newInfra.cost)} CP`
        return {
          cost: newInfra.cost - oldInfra.cost,
          tooltip: infraTooltip,
          storageTk,
        }
      } else {  // !storageTk || lodgingTk != storageTk
        const lodgingOldInfra = state.townsInfra[lodgingTk]
        const lodgingOldStorageSlots = state.townsStoreItemkeys[lodgingTk].size
        const lodgingNewInfra = state.townInfra(lodgingTk, state.townWorkingWorkers(lodgingTk).length+dl, lodgingOldStorageSlots)

        const townsStorageInfras = []
        const storTks = []
        const inner = {}
        if (!storageTk) {  // try sameTown, then compare with best of the rest
          inner.sameTown = state.townInfraAddCost(lodgingTk, dl, itemkeys, lodgingTk)
          for (const tk of Object.keys(state.townsInfra)) {
            if (tk != lodgingTk) storTks.push(tk)
          }
        }
        else { // lodgingTk != storageTk: only search one town for storage
          storTks.push(storageTk)  
        }

        for (const storTk of storTks) {
          const storageOldInfra = state.townsInfra[storTk]
          const storageNewStorageSlots = new Set([...state.townsStoreItemkeys[storTk], ...itemkeys]).size
          const storageNewInfra = state.townInfra(storTk, state.townWorkingWorkers(storTk).length+dl, storageNewStorageSlots)
          if (storageNewInfra.errL || storageNewInfra.errS) continue
          const storageCostDelta = isNaN(storageNewInfra.cost) ? Number.POSITIVE_INFINITY : storageNewInfra.cost - storageOldInfra.cost
          townsStorageInfras.push({storTk, storageOldInfra, storageNewInfra, storageCostDelta})
          if (storageCostDelta == 0) break  // can't do better
          // TODO: out of zeros, further improve by most item intersection
        }
        townsStorageInfras.sort((a,b) => a.storageCostDelta-b.storageCostDelta)
        //console.log('townsNewInfras', townsNewInfras)
        const {storTk, storageOldInfra, storageNewInfra, storageCostDelta} = townsStorageInfras[0]
        const foundTotalCost = storageCostDelta + lodgingNewInfra.cost - lodgingOldInfra.cost

        const gameStore = useGameStore()
        if (inner.sameTown && inner.sameTown.cost <= foundTotalCost) {
          //console.log('sameTown < foundTotalCost', inner.sameTown.cost, foundTotalCost)
          return inner.sameTown
        }
        const tooltip = gameStore.uloc.town[lodgingTk] + 
          ` lodging:\nold: ${Math.max(0, lodgingOldInfra.wantLodging)}🛏️ + ${Math.max(0, lodgingOldInfra.wantStorage)}📦 = ${formatFixed(lodgingOldInfra.cost)} CP\nnew: ${Math.max(0, lodgingNewInfra.wantLodging)}🛏️ + ${Math.max(0, lodgingNewInfra.wantStorage)}📦 = ${formatFixed(lodgingNewInfra.cost)} CP` + "\n" +
          gameStore.uloc.town[storTk] +
          ` storage:\nold: ${Math.max(0, storageOldInfra.wantLodging)}🛏️ + ${Math.max(0, storageOldInfra.wantStorage)}📦 = ${formatFixed(storageOldInfra.cost)} CP\nnew: ${Math.max(0, storageNewInfra.wantLodging)}🛏️ + ${Math.max(0, storageNewInfra.wantStorage)}📦 = ${formatFixed(storageNewInfra.cost)} CP`
        return {
          cost: storageCostDelta + lodgingNewInfra.cost - lodgingOldInfra.cost,
          tooltip,
          storageTk: storTk,
        }
      }
    },

    townsInfra(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      gameStore.townsWithRedirectableStorage.forEach(tnk => {
        const tk = gameStore.tnk2tk(tnk)
        ret[tk] = this.townInfra(tk, 
          state.townWorkingWorkers(tk).length, 
          state.townsStoreItemkeys[tk] ? state.townsStoreItemkeys[tk].size : 0
        )
        //if (isNaN(ret[tk].cost)) throw Error(`no infra for tnk=${tnk} tk=${tk}`)
      })

      //console.log('townsInfra', ret)
      return ret
    },

    lodgage(state) {
      return Object.values(this.townsInfra).reduce((total, ti) => total + ti.cost, 0)
    },

    townsTopIncomeWorkers(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      gameStore.townsWithLodging.forEach(tnk => ret[gameStore.tnk2tk(tnk)] = [])
      for (const [pzk, w] of Object.entries(state.workingWorkers)) {
        const tk = gameStore.tnk2tk(w.tnk)
        ret[tk].push(w)
      }
      for (const [tk, w_list] of Object.entries(ret)) {
        w_list.sort((w1,w2) => state.workerIncome(w2)-state.workerIncome(w1))
      }
      console.log('townsTopIncomeWorkers', ret)
      return ret
    },

    townsSteppedInfra(state) {
      // this recalculates all towns on any change
      const start = Date.now()
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const townsUntakenJobs = []
      gameStore.townsWithRedirectableStorage.forEach(tnk => {
        const tk = gameStore.tnk2tk(tnk)
        townsUntakenJobs[tk] = []
        ret[tk] = []
      })
      for (const [pzk, w] of Object.entries(state.workingWorkers)) {
        townsUntakenJobs[gameStore.tnk2tk(w.tnk)].push(w)
      }

      for (const [tk, workersToOrder] of Object.entries(townsUntakenJobs)) {
        // order workers
        let curL = 0
        let curStorage = new Set([])
        let curI = 0
        const infra = state.townInfra(tk, curL, curStorage.size)
        const initCost = infra.success ? infra.cost : NaN
        let curCost = initCost
        while (workersToOrder.length > 0) {
          // pick best job at this point
          let bestEff = -Infinity
          let bestW = null
          var bestStorage
          var bestI
          var bestCost
          for (const tryW of workersToOrder) {
            const addI = state.workerIncome(tryW)
            const drop = state.workerBringsItemkeys(tryW)
            const newStorage = new Set([...curStorage, ...drop])
            const infra = state.townInfra(tk, curL + 1, newStorage.size)
            if (!infra.success) throw Error(`townsSteppedInfra: failed to provide infrastructure for ${tk}, ${curL + 1}, ${newStorage.size}`)
            
            //const tryEff = addI / (infra.cost - curCost)  // maximize step efficiency 
            const tryEff = (curI + addI) / (infra.cost - initCost)  // maximize town efficiency
            if (tryEff > bestEff || (!(tryEff < bestEff) && addI > bestI)) {
              bestEff = tryEff
              bestW = tryW
              bestStorage = newStorage
              bestI = addI
              bestCost = infra.cost
            }
            //if (tk == 5 && workersToOrder.length == 6) console.log('trying worker', tryW, addI, infra.cost, tryEff, bestEff)
          }
          if (!bestW) throw Error('townsSteppedInfra: efficiency -Inf')
          curL += 1
          curStorage = bestStorage
          curI += bestI
          curCost = bestCost
          // if (tk == 77) console.log('delta_eff', tk, bestI, bestCost, prevCost, delta_eff)
          ret[tk].push({
            w: bestW,
            curL,
            curS: curStorage.size,
            addI: bestI,
            curI,
            cost: bestCost,
            eff: bestEff,
          })
          workersToOrder.splice(workersToOrder.indexOf(bestW), 1)
        }
        // workers are ordered 

        for (let ci = 0; ci < ret[tk].length; ci++) {
          // current row
          const cr = ret[tk][ci]
          // base row is last row where cost is less than current row cost
          let bi = ci - 1
          while (bi >= 0 && ret[tk][bi].cost == cr.cost) bi--
          const br = bi >= 0 ? ret[tk][bi] : {curI: 0, cost: initCost}
          // fill
          cr.delta_eff = (cr.curI - br.curI) / (cr.cost - br.cost)
          //if (tk == 77 && ci == 1) console.log('eff', ci, bi, cr.curI, br.curI, cr.cost, br.cost)
        }

        // now group by same cost? BUT map costs

      }
      console.log('townsSteppedInfra took', Date.now()-start, 'ms')
      return ret
    },

    workersSortedByIncomePerCp(state) {
      const start = Date.now()
      const ret = []
      state.workingWorkers.forEach(w => {
        ret.push({
          w,
          i: state.workerIncome(w),
          ipc: state.workerIncomePerCp(w),
        })
      })
      //ret.sort((a,b)=>a.ipc-b.ipc)
      ret.sort((a,b)=>{
        if(isNaN(a.ipc)) {
          return -1
        }
        if(isNaN(b.ipc)) {
          return 1
        }
        if(!isFinite(a.ipc)) {
          return 1
        }
        if(!isFinite(b.ipc)) {
          return -1
        }
        return a.ipc-b.ipc
      })
      //console.log('workersSortedByIncomePerCp took', Date.now()-start, 'ms', ret)
      return ret
    },

    townsTotalIncome(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      gameStore.townsWithLodging.forEach(tnk => {
        const tk = gameStore.tnk2tk(tnk)
        ret[tk] = {
          income: 0, 
          mapCp: 0, 
          hasNegativeJob: false
        }
      })
      for (const [pzk, w] of Object.entries(state.workingWorkers)) {
        const tk = gameStore.tnk2tk(w.tnk)
        const workerIncome = state.workerIncome(w)
        ret[tk].income += workerIncome
        ret[tk].mapCp += state.workerSharedConnectionCP(w)
        if (workerIncome < 0) {
          ret[tk].hasNegativeJob = true
        }
      }
      for (const [tk, o] of Object.entries(ret)) {
        const townCp = state.townsInfra[tk].cost
        o.eff = o.income / (o.mapCp + townCp)
        if (o.income == 0 && (o.mapCp + townCp) == 0)
          o.eff = 0
      }
      //console.log('townsTotalIncome', ret)
      return ret
    },
    
    workedPlantzones(state) {
      //const jobList = this.workingWorkers.map(({job}) => job)
      const routingStore = useRoutingStore()
      if (!routingStore.pzJobs) return new Set()
      const jobList = Object.keys(routingStore.pzJobs)
      return new Set(jobList)
    },

    pzJobsTotalDailyProfit(state) {
      let sum = 0
      const routingStore = useRoutingStore()
      if (!routingStore.pzJobs) return sum
      for (const job of Object.values(routingStore.pzJobs)) {
        sum += job.profit.priceDaily
      }
      return sum
    },

    pzJobsTotalLodgingCost(state) {
      let sum = 0
      const routingStore = useRoutingStore()
      if (!routingStore.pzJobs) return sum
      for (const [pzk, job] of Object.entries(routingStore.pzJobs)) {
        sum += state.workerSharedLodgageCP(job.worker).value
      }
      return sum
    },

    pzJobsDailyProfitPerCp(state) {
      // can return NaN
      const routingStore = useRoutingStore()
      return this.pzJobsTotalDailyProfit / (routingStore.routing.autotakenNodesCP + state.pzJobsTotalLodgingCost)     
    },


    workersFarming(state) {
      return state.userWorkers.filter(w => w.job == 'farming')
    },

    workersFarmingCount(state) {
      return state.workersFarming.length
    },

    farmingCP(state) {
      return (state.farmingEnable ? 80 - state.farmingP2WShare : 0)
    },

    farmingTotalProfit(state) {
      if (state.farmingEnable)
        return state.farmingBareProfit + (state.farmingProfit - state.farmingBareProfit) / 10 * state.workersFarmingCount
      else
        return 0
    },

    farmingJobsTotalLodgingCost(state) {
      let sum = 0
      state.workersFarming.forEach(w => {
        sum += state.workerSharedLodgageCP(w).value
      })
      return sum
    },

    farmingJobsDailyProfitPerCp(state) {
      return state.farmingTotalProfit / (80 + state.farmingJobsTotalLodgingCost)
    },

    // WORSKHOP //

    workersWorkshop(state) {
      const gameStore = useGameStore()
      return state.userWorkers.filter(w => w.job && gameStore.jobIsWorkshop(w.job))
    },

    workersWorkshopCount(state) {
      return state.workersWorkshop.length
    },

    workshopTotalProfit(state) {
      let ret = 0
      state.workersWorkshop.forEach(w => ret += state.workerIncome(w))
      return ret
    },

    occupiedWorkshops(state) {
      let houses = new Set()
      state.workersWorkshop.forEach(w => houses.add(w.job.hk))
      console.log('occupiedWorkshops', houses)
      return houses
    },

    workshopTotalCP(state) {
      let ret = 0
      state.occupiedWorkshops.forEach(hk => ret += state.getUserWorkshop(hk).manualCp)
      //console.log('houses', houses, 'cp', ret)
      return ret
    },

    workshopJobsTotalLodgingCost(state) {
      let sum = 0
      state.workersWorkshop.forEach(w => {
        sum += state.workerSharedLodgageCP(w).value
      })
      return sum
    },

    workshopJobsDailyProfitPerCp(state) {
      return state.workshopTotalProfit / (state.workshopTotalCP + state.workshopJobsTotalLodgingCost)
    },

    // --------------- CUSTOM ---------------- //

    workersCustom(state) {
      const gameStore = useGameStore()
      return state.userWorkers.filter(w => w.job && gameStore.jobIsCustom(w.job))
    },

    workersCustomCount(state) {
      return state.workersCustom.length
    },

    customTotalProfit(state) {
      let ret = 0
      state.workersCustom.forEach(w => ret += w.job.profit)
      return ret
    },

    customTotalCP(state) {
      let ret = 0
      state.workersCustom.forEach(w => ret += w.job.cp)
      return ret
    },

    customJobsTotalLodgingCost(state) {
      let sum = 0
      state.workersCustom.forEach(w => {
        sum += state.workerSharedLodgageCP(w).value
      })
      return sum
    },

    customJobsDailyProfitPerCp(state) {
      return state.customTotalProfit / (state.customTotalCP + state.customJobsTotalLodgingCost)
    },

    customJobsCp(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      state.workersCustom.forEach(w => {
        const tk = gameStore.tnk2tk(w.tnk)
        if (!(tk in ret)) ret[tk] = 0
        ret[tk] += w.job.cp
      })
      console.log('customJobsCp', ret)
      return ret
    },


    totalCP(state) {
      const routingStore = useRoutingStore()
      return routingStore.routing.autotakenNodesCP 
      + state.farmingCP 
      + state.lodgage
      + state.workshopTotalCP
      + state.customTotalCP
    },

    workersIdleCount(state) {
      return state.countWorkers
      - state.workedPlantzones.size
      - state.workersFarmingCount
      - state.workersWorkshopCount
      - state.workersCustomCount
    },

    allJobsTotalDailyProfit(state) {
      return state.pzJobsTotalDailyProfit
      + state.farmingTotalProfit
      + state.workshopTotalProfit
      + state.customTotalProfit
    },

    allJobsDailyProfitPerCp(state) {
      return this.allJobsTotalDailyProfit / state.totalCP
    },

    workerPzStats(state) {
      // use list or dict here?? or don't cache at all? damn js 
      const gameStore = useGameStore()
      const ret = []
      state.userWorkers.forEach(w => {
        ret.push(gameStore.workerStatsOnPlantzone(w))
      })
      console.log('workerPzStats')
      return ret
    },

    allJobsProfitsBefore(state) {
      const daily = state.allJobsTotalDailyProfit
      const cp = state.totalCP
      const dailyPerCp = state.allJobsDailyProfitPerCp
      return { daily, cp, dailyPerCp }
    },

    jobEfficiencyDelta: (state) => (addProfit, addCp) => {
      const before = state.allJobsProfitsBefore

      const afterDaily = before.daily + addProfit
      const afterMDPerCp = afterDaily / (before.cp + addCp)

      return afterMDPerCp - before.dailyPerCp
    },

    jobsTally(state) {
      const ret = {}
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const routingStore = useRoutingStore()
      if (!routingStore.pzJobs) return ret
      
      for (const [pzk, job] of Object.entries(routingStore.pzJobs)) {
        const pzd = gameStore.plantzones[pzk]
        const luck = gameStore.workerStatsOnPlantzone(job.worker).luck
        const hasLucky = pzd.lucky
        if (hasLucky) {
          for (const [k, q] of Object.entries(pzd.lucky)) {
            if (!(k in ret)) ret[k] = 0
            ret[k] += luck/100 * q * job.profit.cyclesDaily
            //if (k == "5960") console.log(pzk, 'lucky', luck/100 * q * job.profit.cyclesDaily)
          }
        }
        // plantzone has no luck information
        if (gameStore.isGiant(job.worker.charkey)) {
          for (const [k, q] of Object.entries(pzd.unlucky_gi)) {
            if (!(k in ret)) ret[k] = 0
            ret[k] += q * job.profit.cyclesDaily
            //if (k == "5960") console.log(pzk, 'giant', q * job.profit.cyclesDaily)
          }
        }
        else {
          for (const [k, q] of Object.entries(pzd.unlucky)) {
            if (!(k in ret)) ret[k] = 0
            ret[k] += q * job.profit.cyclesDaily
            //if (k == "5960") console.log(pzk, 'nongiant', q * job.profit.cyclesDaily)
          }
        }
      }
      //console.log('jobsTally getter')
      return ret
    },

    cyclesTally(state) {
      let ret = {pz: 0, workshop: 0, chicken: 0}
      const gameStore = useGameStore()
      const routingStore = useRoutingStore()
      if (!gameStore.ready) return ret
      for (const worker of state.workingWorkers) {
        if (!worker) return
        if (gameStore.jobIsPz(worker.job)) {
          if (!routingStore.pzJobs) continue
          const pzJob = routingStore.pzJobs[worker.job.pzk]
          ret.pz += pzJob.profit.cyclesDaily
        }
        if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = state.getUserWorkshop(hk)
          ret.workshop += gameStore.measureWorkshopWorker(hk, workshop, worker).cyclesDaily
        }
      }
      
      //console.log('cyclesTally getter', ret)
      ret.chicken = (ret.pz + ret.workshop) / 3
      return ret
    },

    lodgingCostsPerTownPerJobtype(state) {
      const ret = {}

      state.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk)

      for (const [tk, slots] of Object.entries(state.haveLodging.slots.perTown)) {
        const cp = state.haveLodging.cp.perTown[tk]
        // at least 1 🛏️ free, plus optionally some, with various total CP cost
        state.townWorkers(tk)
      }

      return ret
    },

    bargainBonus() {
      return this.tradingLevel * 0.005;
    },

    // TRADING //

    wagonRoutes(state) {
      const dict = {}
      const ret = []
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      for (const worker of this.workingWorkers) {
        if (gameStore.jobIsWorkshop(worker.job)) {
          const origin = worker.tnk
          if (state.tradeRouteOn[origin]) {
            const destination = Number(state.tradeDestinations[origin])
            //const a = origin < destination ? origin : destination
            //const b = origin < destination ? destination : origin
            const key = `${origin}-${destination}`
            const wagon = {origin, destination, profit: 0}
            if (!(key in dict)) {
              dict[key] = wagon
            }
            dict[key].profit += worker.job.profit
          }
        }
      }
      for (const wagon of Object.values(dict)) {
        ret.push(wagon)
      }
      console.log('wagonRoutes', ret)
      return ret
    },

    perTownPerRecipePerThrifty(state) {
      const ret = {}
      const routingStore = useRoutingStore()
      const gameStore = useGameStore()
      for (const wsj of routingStore.wsJobs) {
        const tnk = wsj.worker.tnk
        const rcp = wsj.worker.job.recipe
        const thriftyPercent = wsj.thriftyWorks ? wsj.thriftyPercent : 'x'
        if (!(rcp in gameStore.craftInputs)) {
          console.log('rcp', rcp, 'not supported')  // non stackable
          continue
        }
        const repeatGroup = gameStore.craftInfo[rcp].rp

        ret[tnk] ??= {}
        ret[tnk][rcp] ??= {}
        ret[tnk][rcp][thriftyPercent] ??= {  // `perf`
          repeatGroup,
          workers: 0, 
          cyclesPerDay: 0, 
          completionsPerDay: 0,
          workload: gameStore.craftInfo[rcp].wl,
        } 
        
        ret[tnk][rcp][thriftyPercent].workers += 1
        const industry = gameStore.craftInfo[rcp].rp
        const hk = wsj.worker.job.hk
        const workshop = state.userWorkshops[hk]
        const cyclesPerDay = gameStore.measureWorkshopWorker(hk, workshop, wsj.worker).cyclesDaily
        ret[tnk][rcp][thriftyPercent].cyclesPerDay += cyclesPerDay
        const repeats = gameStore.repeatsWorkshopWorker(wsj.worker, industry)
        const completionsPerDay = cyclesPerDay * gameStore.craftInfo[rcp].aoc * repeats
        //console.log(industry, cyclesPerDay, repeats, completionsPerDay)
        ret[tnk][rcp][thriftyPercent].completionsPerDay += completionsPerDay
      }
      return ret
    },

    townStat(state) {
      const ret = {}
      const usedOrigins = new Set()
      for (const [origin, rcps] of Object.entries(state.perTownPerRecipePerThrifty)) {
        usedOrigins.add(origin)

        ret[origin] = { 
          workers: 0,
          completionsPerDay: 0,
          completionsPerDayDoubleEnded: 0,  // A→B & B→A connection combined
          reverseConnection: false,
        }
        const destination = state.tradeDestinations[origin]
        if (usedOrigins.has(destination)) {
          if (state.tradeDestinations[destination] == origin)
            ret[origin].reverseConnection = true
        }

        for (const thrifties of Object.values(rcps)) {
          for (const perf of Object.values(thrifties)) {
            ret[origin].workers += perf.workers
            ret[origin].completionsPerDay += perf.completionsPerDay
            //ret[origin].lt += perf.completionsPerDay * // crateWeight
          }
        }

        if (!ret[origin].reverseConnection) {
          ret[origin].completionsPerDayDoubleEnded += ret[origin].completionsPerDay
        }
        else {
          ret[destination].completionsPerDayDoubleEnded += ret[origin].completionsPerDay
          ret[origin].completionsPerDayDoubleEnded = ret[destination].completionsPerDayDoubleEnded
        }
      }
      console.log('townStat', ret)
      return ret
    },

    tradingTable(state) {
      const start = Date.now()
      const ret = {
        towns: {},  // tnk: { row, row, ... }
        transport: {},
        total: {
          silver: 0,
          CP: 0,
          transportUtilization: 0,
        },
      }
      const gameStore = useGameStore()
      const marketStore = useMarketStore()
      const routingStore = useRoutingStore()
      if (!gameStore.ready) return ret
      for (const [origin, rcps] of Object.entries(state.perTownPerRecipePerThrifty)) {
        ret.towns[origin] = []
        const destination = state.tradeDestinations[origin]
        const routeBase = state.townStat[origin].reverseConnection ? destination : origin

        const hours = gameStore.transportHours(origin, destination)
        const wagonRuns = Math.ceil(this.pcHours / hours)
        const transportCycles = Math.ceil(this.pcHours / hours)
        const transportLtPerDay = 5 * transportCycles * 60000
        //if (!(origin in state.tradeRouteCp)) state.tradeRouteCp[origin] = 0
        //const routeCp = state.tradeRouteCp[routeBase] // TODO: f(origin, destination)
        const routeCp = routingStore.wagonCpCosts[origin]?.value || 0
        if (!(origin in state.tradeInfraCp)) state.tradeInfraCp[origin] = 0

        const origDest = `${gameStore.uloc.node[origin]} → ${gameStore.uloc.node[destination]}`
        if (!(origDest in ret.transport)) {
          //console.log(this.pcHours, hours, wagonRuns)
          const haveWagons = 5 * wagonRuns
          ret.transport[origDest] = {
            duration: hoursToHMS(hours),
            wagonRuns,
            haveWagons,
            needWagons: 0,
            utilization: 0,
          }
        }

        for (const [rcp, thrifties] of Object.entries(rcps)) {
          for (const [thriftyPercent, perf] of Object.entries(thrifties)) {
            const makeCost = gameStore.recipeCost(rcp, Number(thriftyPercent))
            const avgRepeats = perf.completionsPerDay / perf.cyclesPerDay
            const feedCost = marketStore.prices[9492]
            const crateFeedCost = feedCost / 3 / avgRepeats
            makeCost.val += crateFeedCost
            makeCost.desc += `${feedCost} / 3 / ${formatFixed(avgRepeats, 2)} = ${formatFixed(crateFeedCost)}\n`
            const aoc = gameStore.craftInfo[rcp].aoc
            if (aoc != 1) {
              makeCost.val /= aoc
              makeCost.desc += `----------------------\n`
              makeCost.desc += `divided by ${aoc}\n`
            }

            //const workshopCostPerCrate = workshopCostDaily * perf.workers / perf.completionsPerDay
            //makeCost.val += workshopCostPerCrate
            //makeCost.desc += `${formatFixed(workshopCostDaily/1000000, 2)}M x ${perf.workers} / ${formatFixed(perf.completionsPerDay)} = ${formatFixed(workshopCostPerCrate)}\n`

            const tradeInfo = gameStore.tradeInfo(rcp, origin, destination, state.tradeRouteOn[routeBase])

            tradeInfo.delta = tradeInfo.sellPrice - makeCost.val - tradeInfo.transportFee
            tradeInfo.deltaDesc = `${formatFixed(tradeInfo.sellPrice)} - ${formatFixed(makeCost.val)} - ${formatFixed(tradeInfo.transportFee)}`
            tradeInfo.roi = tradeInfo.delta / (makeCost.val + tradeInfo.transportFee)
            tradeInfo.dailyProfit = tradeInfo.delta * perf.completionsPerDay / 1000000
            tradeInfo.routeCp = state.tradeRouteAlwaysOn[routeBase]
              ? routeCp * perf.completionsPerDay / state.townStat[origin].completionsPerDayDoubleEnded
              : routeCp * perf.completionsPerDay * tradeInfo.crateWeight / transportLtPerDay
            const routeCpDesc = state.tradeRouteAlwaysOn[origin]
              ? `${formatFixed(routeCp, 2, false, true)}CP conn * ${formatFixed(perf.completionsPerDay)} / ${formatFixed(state.townStat[origin].completionsPerDayDoubleEnded)} crates`
              : `${formatFixed(routeCp, 2, false, true)}CP conn * ${formatFixed(perf.completionsPerDay * tradeInfo.crateWeight / transportLtPerDay * 100, 3)}% utilization`
            tradeInfo.cp = state.tradeInfraCp[origin] / state.townStat[origin].workers * perf.workers + tradeInfo.routeCp
            tradeInfo.cpDesc = `${state.tradeInfraCp[origin]}CP infra * ${perf.workers} / ${state.townStat[origin].workers} workers + ${routeCpDesc}`
            tradeInfo.eff = tradeInfo.dailyProfit / tradeInfo.cp

            const prevRow = ret.towns[origin][ret.towns[origin].length - 1]
            const collapsed = (prevRow && rcp == prevRow.rcp)

            
            ret.towns[origin].push({
              rcp, collapsed, rowspan: 1,
              thriftyPercent,
              makeCost,
              perf,
              tradeInfo,
            })

            ret.transport[origDest].needWagons += perf.completionsPerDay * tradeInfo.crateWeight / 60000
            
            ret.total.silver += perf.completionsPerDay * tradeInfo.delta
            ret.total.CP += tradeInfo.cp
          }
        }
      }

      let incrementingRow
      for (const [origin, rows] of Object.entries(ret.towns)) {
        for (const row of rows) {
          if (!row.collapsed) incrementingRow = row
          else incrementingRow.rowspan++
        }
      }

      for (const tinfo of Object.values(ret.transport)) {
        tinfo.utilization = tinfo.needWagons / tinfo.haveWagons
        ret.total.transportUtilization += tinfo.utilization
      }
      
      ret.total.eff = ret.total.silver / 1000000 / ret.total.CP
      console.log('tradingTable took', Date.now()-start, 'ms', ret)
      return ret
    },

    wagonRoutesProfits(state) {
      const ret = []
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const origDestWagons = {}
      if (state.perTownPerRecipePerThrifty) {
        for (const [origin, rcps] of Object.entries(state.perTownPerRecipePerThrifty)) {
          origDestWagons[origin] ??= {}
          for (const [rcp, thrifties] of Object.entries(rcps)) {
            for (const [thr, perf] of Object.entries(thrifties)) {
              const destination = state.tradeDestinations[origin]
              origDestWagons[origin][destination] ??= 0
              const tradeInfo = gameStore.tradeInfo(rcp, origin, destination)
              origDestWagons[origin][destination] += perf.completionsPerDay * tradeInfo.crateWeight / 60000
            }
          }
        }
      }
      
      for (const {origin, destination} of state.wagonRoutes) {
        const wagons = (origDestWagons[origin] && origDestWagons[origin][destination]) ? origDestWagons[origin][destination] : 0
        const wagonConnectionProfit = gameStore.wagonFee(origin, destination, false) - gameStore.wagonFee(origin, destination, true)
        const profit = wagons * wagonConnectionProfit / 1000000
        ret.push({origin, destination, profit})
      }
      return ret
    },
    
  },

});
