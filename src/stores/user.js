import {defineStore} from "pinia";
import {useGameStore} from './game'
import {searchSorted} from '../util.js'
import {formatFixed} from '../util.js';

export const useUserStore = defineStore({
  id: "user",
  state: () => ({
    selectedLang: 'en',
    selectedRegion: 'RU',
    selectedTax: 0.65,
    customPrices: {},
    keepItems: {},
    regionModifiers: {},
    allowFloating: false,
    useFloatingModifiers: {},
    regionModifiers2: {},
    
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
    userWorkshops: {},
    defaultUserWorkshop: {
      industry: 'unknown',
      label: '', 
      manualCycleIncome: 0, 
      manualWorkload: 300, 
      manualCp: 0
    },
    
    mapHideInactive: 0,

    palaceEnable: false,
    palaceProfit: 0,

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
        })
      }

      if ('farmingP2W' in parsed) {
        parsed.farmingP2WShare = parsed.farmingP2W ? 80 : 0
        delete parsed.farmingP2W
        updated = true
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
      var fromIndex = this.userWorkers.indexOf(worker)
      console.log('fromIndex', fromIndex)
      this.userWorkers.splice(fromIndex, 1)
      this.userWorkers.push(worker)
      worker.job = job
      console.log('assigned', worker.label, 'to', worker.job)
    },

    // --------- floating modifier related

    chanceAtModifier(rgk, mod) {
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
        console.log('undefined modifiers at rgk', rgk)
      const pos_a = searchSorted(this.modSorteds[rgk], mod)
      //console.log(mod, pos_a)
      const pos_b = pos_a + 1
      if (pos_a === -1) return 100
      const size = this.modSorteds[rgk].length
      if (pos_a === size) return 0
      const mod_a = this.modSorteds[rgk][pos_a]
      const time_a = this.modTimes[rgk][mod_a]
      //console.log('chanceAtModifier', mod, pos_a, pos_b)
      if (pos_a == pos_b) return time_a
      const mod_b = this.modSorteds[rgk][pos_b]
      const time_b = this.modTimes[rgk][mod_b]
      const lerp_factor = (mod - mod_a) / (mod_b - mod_a)
      const time = time_a + lerp_factor * (time_b - time_a)
      //console.log(mod, mod_a, mod_b, lerp_factor, time_a, time_b, time)
      return time
    },

    tierModifiers(rgk, baseWorkload, wspd) {
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
        const time = this.chanceAtModifier(rgk, mod*100)
        //console.log(`w < ${wld.toFixed(2)}, mod > ${mod.toFixed(3)} -> tier ${tier}, time ${time}`)
        if (time == 0) continue
        ret.push({wld, mod, tier, time: time - prev_tier_time})
        prev_tier_time = time
      }
      //console.log(rgk, baseWorkload, wspd, 'tierModifiers', ret.length)
      return ret
    },

    calcWalkMinutes(dist, mspd) {
      return 2 * dist / mspd / 60
    },
    
    calcCyclesDaily(baseWorkload, rgk, wspd, dist, mspd) {
      let ret = 0
      const moveMinutes = this.calcWalkMinutes(dist, mspd)
      if (this.allowFloating && this.useFloatingModifiers[rgk]) {
        for (const r of this.tierModifiers(rgk, baseWorkload, wspd)) {
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
      //console.log(baseWorkload, this.useFloatingModifiers[rgk], wspd, dist, mspd, 'cycleMinutes', ret)
      
      return ret
    },

    modifyGrindTakens(e, pzk) {
      if (e.target.checked) {
        this.grindTakenSet.add(pzk)
      }
      else {
        this.grindTakenSet.delete(pzk)
      }
      this.grindTakenList = [...this.grindTakenSet]
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
    
    // --------- floating modifier related

    floatingRegionGroups() {
      const gameStore = useGameStore()
      const ret = Object.keys(gameStore.regionGroups).filter(rgk => this.useFloatingModifiers.hasOwnProperty(rgk) && this.useFloatingModifiers[rgk])
      //console.log('floatingRegionGroups', ret)
      return ret
    },
    modHists() {
      const ret = {}
      const gameStore = useGameStore()
      for (const rgk of Object.keys(gameStore.regionGroups)) {
        if (this.regionModifiers.hasOwnProperty(rgk)) {
          ret[rgk] = [this.regionModifiers[rgk]]
        }
        else {
          ret[rgk] = [0]
        }
      }
      for (const rgk of this.floatingRegionGroups) {
        if (!(this.regionModifiers2.hasOwnProperty(rgk))) {
          this.regionModifiers2[rgk] = [0]
        }
        // [0, 50, 0] -> [50, 0, 0]
        const sorted = this.regionModifiers2[rgk]
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
    medianModifiers() {
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
      //console.log('medianModifiers', ret)
      return ret
    },
    medianWorkloads() {
      const ret = {}
      const gameStore = useGameStore()
      for (const [pzk, pzd] of Object.entries(gameStore.plantzones)) {
        const rgk = pzd.regiongroup
        ret[pzk] = pzd.workload * (2 - this.medianModifiers[rgk]/100)
      }
      //console.log('medianWorkloads', ret)
      return ret
    },
    modTimes() {
      const average = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;
      const ret = {}
      const gameStore = useGameStore()
      for (const rgk of Object.keys(gameStore.regionGroups)) {
        // [50, 0, 0] modifiers -> {50 mod: 33% time, 0 mod: 100% time}
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
      const prod = rgr in state.regionModifiers ? state.regionModifiers[rgr] : 0
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

    autotakenGrindNodes(state) {
      const ret = new Set()
      const gameStore = useGameStore()
      if (gameStore.ready) {
        state.grindTakenList.forEach(pzk => {
          const paths = gameStore.dijkstraNearestTowns(Number(pzk), 4, ret, false, true)
          const list = paths.sort((a,b)=>a[1]-b[1])
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          usedPath.forEach(nk => ret.add(nk))
        })
      } 

      //console.log('autotakenGrindNodes getter', ret)
      return ret
    },

    pzWsJobs(state) {
      const ret = {
        pz: {},
        ws: [],
        map: [],
        nodeUsedbyJob: {},
      }
      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      //const localTaken = new Set([...state.autotakenGrindNodes])
      //if (!gameStore.ready) return ret
      const routees = []

      this.workingWorkers.forEach(worker => {
        const routee = {source: worker.tnk}
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          routee.target = pzk
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const houseTk = gameStore.houseInfo[hk].affTown
          const houseTnk = gameStore.tk2tnk(houseTk)
          routee.target = houseTnk
        }
        else return

        routees.push(routee)
      })

      const routeInfos = gameStore.route(state.autotakenGrindNodes, routees).routeInfos

      this.workingWorkers.forEach(worker => {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) return
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const route = routeInfos[worker.tnk][pzk]
          const job = {
            pzk,
            worker,
            profit,
            ...route
          }
          ret.pz[pzk] = job
          ret.map.push(job)
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = this.userWorkshops[hk]
          const houseTk = gameStore.houseInfo[hk].affTown
          const houseTnk = gameStore.tk2tnk(houseTk)
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          const route = routeInfos[worker.tnk][houseTnk]
          const job = {
            hk,
            worker,
            profit,
            ...route
          }
          ret.ws.push(job)
          ret.map.push(job)
        }
      })

      /*const usualSuspects = [304]    // commonly taken excessive nodes
      usualSuspects.forEach(nk => {
        if (nk in ret.nodeUsedbyJob) {
          const affected = ret.nodeUsedbyJob[nk]

          const altTaken = localTaken.difference(new Set([nk]))
          let success = true
          let freed = 0
          for (const job of affected) {
            const [newPath, newPathCost] = gameStore.dijkstraPath(job.pzk, job.worker.tnk, altTaken)
            if (newPath) {
              job.newPath = newPath
              job.newPathCost = newPathCost
              freed += (job.usedPathCost - newPathCost)
            } else {
              success = false
              break
            }
          }

          if (success && freed > 0) {
            console.log(`post-routing: removing ${nk} freed ${freed} CP`)
            for (const job of affected) {
              job.usedPath = job.newPath
              job.usedPathCost = job.newPathCost
            }
          }
        }
      })*/

      //console.log('pzWsJobs getter', ret)
      return ret
    },

    // used EVERYWHERE
    pzJobs(state) {
      return state.pzWsJobs.pz
    },
    
    // used to display town-remote workshop line
    wsJobs(state) {
      return state.pzWsJobs.ws
    },

    // used to display sharing info in selected node pane and for shared CP calculation
    mapJobs(state) {
      return state.pzWsJobs.map
    },

    currentNodesJobs(state) {
      const nodesJobs = {}
      for (const job of state.mapJobs) {
        if (job.usedPath) {
          job.usedPath.forEach(nk => 
            nk in nodesJobs ? nodesJobs[nk].push(job) : nodesJobs[nk] = [job]
          )
        }
      }
      return nodesJobs
    },

    currentNodesCashflow(state) {
      const cashFlows = {}
      for (const job of state.mapJobs) {
        if (job.usedPath) {
          job.usedPath.forEach(nk => nk in cashFlows ? cashFlows[nk] += job.profit.priceDaily : cashFlows[nk] = job.profit.priceDaily)
        }
      }
      //console.log('currentNodesCashflow', cashFlows)
      return cashFlows
    },

    pzjobsSharedConnectionCP(state) {
      const ret = {}
      const gameStore = useGameStore()
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
        ret[pzk] = {
          value: 0,
          tooltip: ""
        }
        if (job.usedPath) {
          job.usedPath.forEach(function(nk) {
            if (state.autotakenGrindNodes.has(nk)) {
              return ret // zero-cost
            }
            const nodeCostShare = job.profit.priceDaily / state.currentNodesCashflow[nk]
            const nodeCostShared = gameStore.nodes[nk].CP * nodeCostShare
            ret[pzk].value += nodeCostShared
            ret[pzk].tooltip += `${formatFixed(nodeCostShared, 3)} ${gameStore.nodeName(nk)}\n`
          })
        }
      }
      //console.log('pzjobsSharedConnectionCP', ret)
      return ret
    },

    pzjobsSharedEfficiency(state) {
      const ret = {}
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
        if (job.usedPath) {
          ret[pzk] = job.profit.priceDaily / state.pzjobsSharedConnectionCP[pzk]
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
      state.workingWorkers.forEach(w => {
        if (gameStore.jobIsPz(w.job)) {
          const tk = gameStore.tnk2tk(w.job.storage)
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
      const best = gameStore.lsLookup(tk, wantLodging, wantStorage)
      //if (tk==1382)
        //console.log('townInfra', tk, wantLodging, wantStorage, best)
      return best
    },

    townInfraAddCost: (state) => (lodgingTk, dl, itemkeys, storageTk) => {
      // cost and specifics of adding 
      // `dl` additional lodging slots 
      // and storage for additional `itemkeys` 
      // to town `tk` with current user settings
      if (storageTk && lodgingTk != storageTk) {
        const storageOldInfra = state.townsInfra[storageTk]
        const storageNewStorageSlots = new Set([...state.townsStoreItemkeys[storageTk], ...itemkeys]).size
        const storageNewInfra = state.townInfra(storageTk, state.townWorkingWorkers(storageTk).length, storageNewStorageSlots)
        const lodgingOldInfra = state.townsInfra[lodgingTk]
        const lodgingOldStorageSlots = state.townsStoreItemkeys[lodgingTk].size
        const lodgingNewInfra = state.townInfra(lodgingTk, state.townWorkingWorkers(lodgingTk).length+dl, lodgingOldStorageSlots)
        const gameStore = useGameStore()
        const infraTooltip = gameStore.uloc.town[lodgingTk] + 
          ` housing:\nold: ${Math.max(0, lodgingOldInfra.wantLodging)}🛏️ + ${Math.max(0, lodgingOldInfra.wantStorage)}📦 = ${formatFixed(lodgingOldInfra.cost)} CP\nnew: ${Math.max(0, lodgingNewInfra.wantLodging)}🛏️ + ${Math.max(0, lodgingNewInfra.wantStorage)}📦 = ${formatFixed(lodgingNewInfra.cost)} CP` + "\n" +
          gameStore.uloc.town[storageTk] +
          ` housing:\nold: ${Math.max(0, storageOldInfra.wantLodging)}🛏️ + ${Math.max(0, storageOldInfra.wantStorage)}📦 = ${formatFixed(storageOldInfra.cost)} CP\nnew: ${Math.max(0, storageNewInfra.wantLodging)}🛏️ + ${Math.max(0, storageNewInfra.wantStorage)}📦 = ${formatFixed(storageNewInfra.cost)} CP`
        return {
          cost: storageNewInfra.cost - storageOldInfra.cost + lodgingNewInfra.cost - lodgingOldInfra.cost,
          tooltip: infraTooltip,
        }
      } else {
        const tk = lodgingTk  // == storageTk
        const oldInfra = state.townsInfra[tk]
        const newStorage = new Set([...state.townsStoreItemkeys[tk], ...itemkeys]).size
        const newInfra = state.townInfra(tk, state.townWorkingWorkers(tk).length+dl, newStorage)
        const gameStore = useGameStore()
        const infraTooltip = gameStore.uloc.town[tk] + ` housing:\nold: ${Math.max(0, oldInfra.wantLodging)}🛏️ + ${Math.max(0, oldInfra.wantStorage)}📦 = ${formatFixed(oldInfra.cost)} CP\nnew: ${Math.max(0, newInfra.wantLodging)}🛏️ + ${Math.max(0, newInfra.wantStorage)}📦 = ${formatFixed(newInfra.cost)} CP`
        return {
          cost: newInfra.cost - oldInfra.cost,
          tooltip: infraTooltip,
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
          state.townsStoreItemkeys[tk] ? state.townsStoreItemkeys[tk].size : 0)
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
        //gameStore.dijkstraPath(start, finish, takens)
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

    workerIncome: (state) => (w) => {
      const gameStore = useGameStore()
      if (gameStore.jobIsIdle(w.job))
        return 0
      if (gameStore.jobIsPz(w.job)) {
        if (state.pzJobs[w.job.pzk] == undefined) {
          throw Error(`pzjob ${w.job.pzk} is undefined`)
        }
        return state.pzJobs[w.job.pzk].profit.priceDaily
      }
      if (gameStore.jobIsFarming(w.job))
        return state.farmingProfitPerWorker
      if (gameStore.jobIsCustom(w.job))
        return w.job[1]
      if (gameStore.jobIsWorkshop(w.job)) {
        const hk = w.job.hk
        if (!(hk in state.userWorkshops)) {
          state.userWorkshops[hk] = { ...state.defaultUserWorkshop }
        }
        const workshop = state.userWorkshops[hk]
        const profit = gameStore.profitWorkshopWorker(hk, workshop, w).priceDaily
        return profit
      }
      return undefined
    },

    workerSharedConnectionCP: (state) => (w) => {
      let ret = undefined
      const gameStore = useGameStore()
      if (gameStore.jobIsPz(w.job))
        ret = state.pzjobsSharedConnectionCP[w.job.pzk].value
      if (gameStore.jobIsFarming(w.job))
        ret = 0
      if (gameStore.jobIsCustom(w.job))
        ret = w.job[2]
      if (gameStore.jobIsWorkshop(w.job)) {
        const workersAtWorkshop = state.workersWorkshop.filter(ww => ww.job.hk == w.job.hk).length
        ret = state.userWorkshops[w.job.hk].manualCp / workersAtWorkshop
      }
      //console.log(`workerSharedConnectionCP ${w.label} = ${ret}`)
      return ret
    },

    workerSharedLodgageCP: (state) => (w) => {
      const ret = {
        value: undefined,
        tooltip: '?'
      }
      const gameStore = useGameStore()
      if (!gameStore.ready)
        return ret
      const income = state.workerIncome(w)
      const tk = gameStore.tnk2tk(w.tnk)
      const townInfraCp = state.townsInfra[tk].cost  // lodging for pz+ws + storage for pz+personal
      
      const townTotalWorkers = state.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk).length
      const townTotalIncome = state.townsTotalIncome[tk].income

      if (state.townsTotalIncome[tk].hasNegativeJob || townTotalIncome == 0)  {
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

    workerIncomePerCp: (state) => (w) => {
      const income = state.workerIncome(w)
      const sharedCp = state.workerSharedConnectionCP(w)
      const sharedLodgage = state.workerSharedLodgageCP(w).value
      const ret = income / (sharedCp + sharedLodgage)
      if (isNaN(ret)) 
        console.log(`workerIncomePerCp: ${formatFixed(income, 2)} / (${formatFixed(sharedCp, 2)} + ${formatFixed(sharedLodgage, 2)}) = ${formatFixed(ret, 2)} for worker ${w.label}`)
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
      const jobList = Object.keys(state.pzJobs)
      return new Set(jobList)
    },

    autotakenGrindNodesCP(state) {
      const gameStore = useGameStore()
      const ret = [...state.autotakenGrindNodes].reduce((acc, v) => acc + gameStore.nodes[v].CP, 0)
      console.log('autotakenGrindNodesCP', ret)
      return ret
    },

    autotakenNodes(state) {
      // grind
      const ret = new Set([...state.autotakenGrindNodes])
      // platzones and workshops
      for (const job of state.mapJobs) {
        if (job.usedPath)
          job.usedPath.forEach(nk => ret.add(nk))
      }
      // connect ancado
      const gameStore = useGameStore()
      if (gameStore.ready) {
        if (state.activateAncado) {
          const toTowns = gameStore.dijkstraNearestTowns(1343, 4, ret, false, true)
          const list = toTowns.sort((a,b)=>a[1]-b[1])
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          usedPath.forEach(nk => ret.add(nk))
        }
      }

      console.log('autotakenNodes getter', ret)
      return ret
    },

    autotakenNodesCP(state) {
      const gameStore = useGameStore()
      const sum = [...state.autotakenNodes].reduce((acc, v) => acc + gameStore.nodes[v].CP, 0)
      return sum - state.autotakenGrindNodesCP
    },

    pzJobsTotalDailyProfit(state) {
      let sum = 0
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
        sum += job.profit.priceDaily
      }
      return sum
    },

    pzJobsTotalLodgingCost(state) {
      let sum = 0
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
        sum += state.workerSharedLodgageCP(job.worker).value
      }
      return sum
    },

    pzJobsDailyProfitPerCp(state) {
      // can return NaN
      return this.pzJobsTotalDailyProfit / (state.autotakenNodesCP + state.pzJobsTotalLodgingCost)     
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
      state.occupiedWorkshops.forEach(hk => ret += state.userWorkshops[hk].manualCp)
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
      state.workersCustom.forEach(w => ret += w.job[1])
      return ret
    },

    customTotalCP(state) {
      let ret = 0
      state.workersCustom.forEach(w => ret += w.job[2])
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


    totalCP(state) {
      // grind nodes cost exluded
      return state.autotakenNodesCP 
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
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
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
      if (!gameStore.ready) return ret
      this.workingWorkers.forEach(worker => {
        if (!worker) return
        if (gameStore.jobIsPz(worker.job)) {
          const pzJob = state.pzJobs[worker.job.pzk]
          ret.pz += pzJob.profit.cyclesDaily
        }
        if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          if (!(hk in state.userWorkshops)) {
            state.userWorkshops[hk] = { ...state.defaultUserWorkshop }
          }
          const workshop = state.userWorkshops[hk]
          ret.workshop += gameStore.cyclesWorkshopWorker(hk, workshop, worker).cyclesDaily
        }
      })
      
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
    
  },
});
