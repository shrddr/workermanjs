import {defineStore} from "pinia";
import {useGameStore} from './game.js'
import {useUserStore} from './user.js'
import {formatFixed} from '../util.js'
import {Route, Profit, MapJob, MapJobGrind, MapJobPlantzone, MapJobWorkshop, MapJobWagon} from '../types/all.ts'

export const useRoutingStore = defineStore({
  id: "routing",
  state: () => ({
    
  }),
  actions: {
    applyWasmWorkarounds(currentSolution, currentInput) {
      const gameStore = useGameStore()
      const userStore = useUserStore()
      const grindNodeTryTown = {
        1152: 1002,
      }

      for (const nd of userStore.grindTakenList) {
        if (nd in grindNodeTryTown) {
          const grindNode = nd
          const tryTown = grindNodeTryTown[nd]
          const altInput = []  
          for (const pair of currentInput) {
            // replace a "wildcard town" 99999 with specific town
            altInput.push(pair[0] == grindNode && pair[1] == 99999 ? [grindNode, tryTown]: pair)
          }
          const altSolution = gameStore.wasmRouter.solveForTerminalPairs(altInput)
          const altCost = altSolution.reduce((sum, item) => sum + gameStore.nodes[item].CP, 0)
          const currentCost = currentSolution.reduce((sum, item) => sum + gameStore.nodes[item].CP, 0)
          if (altCost < currentCost) {
            console.log(`wasm workaround applied (${altCost} < ${currentCost})`)
            return altSolution
          }
          else {
            // console.log(`workaround not applied (${altCost} >= ${currentCost})`)
          }
        }
      }
      return currentSolution
    },
  },

  getters: {
    routing(state) {
      const userStore = useUserStore()
      if (userStore.strictPriority) {
        return userStore.wasmRouting ? state.routingWasmCatorder : state.routingOldCatorder
      } else {
        return userStore.wasmRouting ? state.routingWasm : state.routingOld
      }
    },

    routingOldCatorder(state) {
      // old method - order-dependent dijkstra (order is configurable)
      // each CP point is fully owned by some job category;
      // those that are owned by Plantzone category will be shared between Plantzones
      const ret = {
        autotakenNodes: new Set(),
        autotakenNodesCP: 0,
        autotakenWorkerNodes: new Set(),
        autotakenWorkerNodesCP: 0,
        autotakenGrindNodes: new Set(),
        autotakenGrindNodesCP: 0,
        autotakenWagonNodes: new Set(),
        autotakenWagonNodesCP: 0,
        linkColors: {},
        pzWsJobs: {
          pz: {},  // pzk => job
          ws: [],  // job, job
          map: [], // job, job
          nodeUsedbyJob: {},
        }
      }

      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const userStore = useUserStore()

      // OC1. gather up the routees
      const routees = []

      for (const routeeType of userStore.linkOrder) {
        if (routeeType.name == 'grind') {
          for (const nk of userStore.grindTakenList) {
            const profit = userStore.grindTakenValues[nk] == "" ? 0 : userStore.grindTakenValues[nk]
            routees.push({type: 'grind', nk: Number(nk), profit})
          }
        }

        if (routeeType.name == 'worker') {
          for (const worker of userStore.workingWorkers) {
            if (gameStore.jobIsPz(worker.job)) {
              routees.push({type: 'worker', source: worker.tnk, target: worker.job.pzk})
            }
            else if (gameStore.jobIsWorkshop(worker.job)) {
              const hk = worker.job.hk
              const nk = gameStore.houseInfo[hk].parentNode
              routees.push({type: 'worker', source: worker.tnk, target: nk})
            }
          }
          if (userStore.activateAncado) {
            routees.push({type: 'ancado'})
          }
        }

        if (routeeType.name == 'wagon') {
          for (const wp of userStore.wagonRoutesProfits) {
            routees.push({type: 'wagon', ...wp})
          }
        }
      }

      // OC2/3. perform the routing of sub-graphs
      const usedPaths = {}
      for (const routee of routees) {
        if (routee.type == 'grind') {
          const paths = gameStore.dijkstraNearestTowns(routee.nk, 4, ret.autotakenNodes, false, true)
          const list = paths.sort((a,b)=>a[1]-b[1])  // from lowest to highest CP
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          let prev_nk = null
          for (const nk of usedPath) {
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenGrindNodes.add(nk)
              ret.autotakenGrindNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'grind'
            prev_nk = nk
          }
          const mapJob = new MapJobGrind(new Route(usedPath), new Profit(routee.profit), routee.nk)
          ret.pzWsJobs.map.push(mapJob)
        }
        if (routee.type == 'wagon') {
          const [usedPath, usedPathCost] = gameStore.dijkstraPath(routee.destination, routee.origin, ret.autotakenNodes)
          if (!usedPath) continue
          
          let prev_nk = null
          for (const nk of usedPath) {
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWagonNodes.add(nk)
              ret.autotakenWagonNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'wagon'
            prev_nk = nk
          }
          const mapJob = new MapJobWagon(new Route(usedPath), new Profit(routee.profit), routee.origin, routee.destination)
          ret.pzWsJobs.map.push(mapJob)
        }
        if (routee.type == 'ancado') {
          const toTowns = gameStore.dijkstraNearestTowns(1343, 4, ret.autotakenNodes, false, true)
          const list = toTowns.sort((a,b)=>a[1]-b[1])
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          let prev_nk = null
          for (const nk of usedPath) {
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWorkerNodes.add(nk)
              ret.autotakenWorkerNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'worker'
            prev_nk = nk
          }
        }
        if (routee.type == 'worker') {  // expanded below
          const [usedPath, usedPathCost] = gameStore.dijkstraPath(routee.target, routee.source, ret.autotakenNodes)
          if (!usedPath) continue

          let prev_nk = null
          for (const nk of usedPath) {
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWorkerNodes.add(nk)
              ret.autotakenWorkerNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'worker'
            prev_nk = nk
          }
          usedPaths[routee.source] ??= {}
          usedPaths[routee.source][routee.target] = usedPath
        }
      }     
      
      for (const worker of userStore.workingWorkers) {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) continue
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const usedPath = usedPaths[worker.tnk][worker.job.pzk]
          const mapJob = new MapJobPlantzone(new Route(usedPath), profit, pzk, worker)
          ret.pzWsJobs.pz[pzk] = mapJob
          ret.pzWsJobs.map.push(mapJob)
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const nk = gameStore.houseInfo[hk].parentNode
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          let thriftyPercent = 0
          let thriftyWorks = false
          const rcp = worker.job.recipe
          if (gameStore.craftInputs && rcp in gameStore.craftInputs) {
            const inputs = gameStore.craftInputs[rcp]
            for (const ik of Object.keys(inputs)) {
              if (inputs[ik] >= 10) {
                thriftyWorks = true
              }
            }
            for (const sk of worker.skills) {
              if (sk > 0) {
                if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
              }
            }
          }
          const usedPath = usedPaths[worker.tnk][nk]
          const mapJob = new MapJobWorkshop(new Route(usedPath), profit, hk, worker, thriftyWorks, thriftyPercent)
          ret.pzWsJobs.ws.push(mapJob)
          ret.pzWsJobs.map.push(mapJob)
        }
      }

      return ret
    },

    routingWasm(state) {
      // simultaneous routing (by thell) 
      // no job owns a CP point (each node can be shared between a wagon, a pz/ws, and a grind path)
      const ret = {
        autotakenNodes: new Set(),
        autotakenNodesCP: 0,
        autotakenWorkerNodes: new Set(),
        autotakenWorkerNodesCP: 0,
        autotakenGrindNodes: new Set(),
        autotakenGrindNodesCP: 0,
        autotakenWagonNodes: new Set(),
        autotakenWagonNodesCP: 0,
        linkColors: {},
        pzWsJobs: {
          pz: {},
          ws: [],
          map: [],
          nodeUsedByJob: {},
        },
      }

      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const userStore = useUserStore()

      const firstUniques = new Set() // wasm router wants first arg to be unique
      const terminalPairs = []  // input of wasm noderouter
      const routees = [] // a routee can be either a grind node, a worker (pz/ws) or a wagon

      // W1. gather up the routees
      for (const nk of userStore.grindTakenList) {
        const profit = userStore.grindTakenValues[nk] == "" ? 0 : userStore.grindTakenValues[nk]
        routees.push({type: 'grind', nk, profit})
        terminalPairs.push([nk, 99999])
      }
    
      userStore.workingWorkers.forEach(worker => {
        const tnk = worker.tnk
        var nk
        var profit
        if (gameStore.jobIsPz(worker.job)) {
          nk = worker.job.pzk
          profit = worker.job.profit
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          nk = gameStore.houseInfo[hk].parentNode
          profit = worker.job.profit
          if (nk == tnk) {  // highlight the local workshop towns on map
            if (!(ret.autotakenNodes.has(nk))) {
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            ret.autotakenNodes.add(nk)
          }
        }
        else return
        routees.push({type: 'worker', tnk, nk, profit})
        if (nk != tnk) {
          if (firstUniques.has(nk)) console.log(`duplicate nk=${nk} (from tnk=${tnk}) may cause wasm to misbehave`)
          terminalPairs.push([nk, tnk])
          firstUniques.add(nk)
        }
      })
      if (userStore.activateAncado) {
        routees.push({type: 'ancado', profit: 0})  // TODO: all ancado-related jobs' connections should be extended instead
        const nk = 1343
        if (firstUniques.has(nk)) console.log(`duplicate nk=${nk} (from 99999) may cause wasm to misbehave`)
        terminalPairs.push([nk, 99999])
      }
    
      for (const wp of userStore.wagonRoutesProfits) {
        routees.push({type: 'wagon', ...wp})
        terminalPairs.push([wp.origin, wp.destination])
      }
        
      // W2. perform the routing - get the big graph of all routees
      let activatedNodes = []
      if (terminalPairs.length > 0) {
        const startTime = performance.now()

        const [list1, cost1] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
        if (userStore.wasm.tryMoreFrontierRings) {
          gameStore.wasmRouter.setOption("max_frontier_rings", "5")
          const [list2, cost2] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
          gameStore.wasmRouter.setOption("max_frontier_rings", "3")
          activatedNodes = cost1 <= cost2 ? list1 : list2
          if (userStore.wasm.debugMoreFrontierRings) {
            console.log("cost1", cost1, "cost2", cost2)
          }
        }
        else {
          activatedNodes = list1
        }

        //console.log('terminalPairs for wasmRouter', terminalPairs)
        const took = performance.now() - startTime
        //console.log('wasm input', terminalPairs)
        //console.log('wasm output', activatedNodes)
        console.log('wasm took', took.toFixed(2), 'ms')
      }

      activatedNodes = this.applyWasmWorkarounds(activatedNodes, terminalPairs)
      
      // W3. get the sub-graph of each routee
      const nodeUsedBy = {}
      for (const nk of activatedNodes) {
        ret.autotakenNodes.add(nk)
        ret.autotakenNodesCP += gameStore.nodes[nk].CP
        nodeUsedBy[nk] = []
      }
     
      const usedPaths = {}
      for (const routee of routees) {
        if (routee.type == 'grind') {
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, routee.nk, 99999)
          const mapJob = new MapJobGrind(new Route(usedPath), new Profit(routee.profit), routee.nk)
          ret.pzWsJobs.map.push(mapJob)

          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['grind'] ??= 0
              ret.linkColors[linkid]['grind'] += routee.profit
            }
            prev_nk = nk
          }
        }
        if (routee.type == 'wagon') {
          const {origin, destination} = routee
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, destination, origin)
          const mapJob = new MapJobWagon(new Route(usedPath), new Profit(routee.profit), routee.origin, routee.destination)
          ret.pzWsJobs.map.push(mapJob)

          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['wagon'] ??= 0
              ret.linkColors[linkid]['wagon'] += routee.profit
            }
            prev_nk = nk
          }
        }
        if (routee.type == 'ancado') {
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, 1343, 99999)
          const mapJob = new MapJob(new Route(usedPath), new Profit(routee.profit))
          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += routee.profit
            }
            prev_nk = nk
          }
        }
        if (routee.type == 'worker') {  // expanded below
          const {nk, tnk} = routee
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, nk, tnk)
          usedPaths[tnk] ??= {}
          usedPaths[tnk][nk] = usedPath
        }
      }

      
      for (const worker of userStore.workingWorkers) {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) continue
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const usedPath = usedPaths[worker.tnk][pzk]
          const mapJob = new MapJobPlantzone(new Route(usedPath), profit, pzk, worker)
          ret.pzWsJobs.pz[pzk] = mapJob
          ret.pzWsJobs.map.push(mapJob)
          let prev_nk = null
          for (const nk of mapJob.route.usedPath) {
            if (!(nk in nodeUsedBy)) continue  // skip towns
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += profit.priceDaily
            }
            prev_nk = nk
          }
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const nk = gameStore.houseInfo[hk].parentNode
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          const usedPath = usedPaths[worker.tnk][nk]

          let thriftyPercent = 0
          let thriftyWorks = false
          const rcp = worker.job.recipe
          if (gameStore.craftInputs && rcp in gameStore.craftInputs) {
            const inputs = gameStore.craftInputs[rcp]
            for (const ik of Object.keys(inputs)) {
              if (inputs[ik] >= 10) {
                thriftyWorks = true
              }
            }
            for (const sk of worker.skills) {
              if (sk > 0) {
                if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
              }
            }            
          }
          const mapJob = new MapJobWorkshop(new Route(usedPath), profit, hk, worker, thriftyWorks, thriftyPercent)
          ret.pzWsJobs.ws.push(mapJob)
          ret.pzWsJobs.map.push(mapJob)
          let prev_nk = null
          for (const nk of mapJob.route.usedPath) {
            if (!(nk in nodeUsedBy)) continue  // skip towns
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += profit.priceDaily
            }
            prev_nk = nk
          }
        }
      }

      // W4. calculate sharing
      // this is already done in `nodesUsedBy`, but
      // needs to be done here as well to calculate fractional CP totals

      const nodeTotalProfit = {}
      for (const [nk, ownerships] of Object.entries(nodeUsedBy)) {
        nodeTotalProfit[nk] = 0
        for (const ownership of ownerships) {
          nodeTotalProfit[nk] += ownership.mapJob.profit.priceDaily
        }

        for (const ownership of ownerships) {
          ownership.share = ownership.mapJob.profit.priceDaily / nodeTotalProfit[nk]
          const cpFraction = gameStore.nodes[nk].CP * ownership.share
          if (ownership.mapJob instanceof MapJobPlantzone) ret.autotakenWorkerNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobWorkshop) ret.autotakenWorkerNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobGrind) ret.autotakenGrindNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobWagon) ret.autotakenWagonNodesCP += cpFraction
        }
      }
      //console.log('nodeUsedBy', nodeUsedBy)
      //ret.pzWsJobs.nodeUsedByJob = nodeUsedBy

      return ret
    },



    routingWasmCatorder(state) {
      // wasm routing (by thell)
      // simultaneous.
      // each CP point is fully owned by some job.
      // the order of assuming ownership is configurable by category (grind, pz, wagon).
      const ret = {
        autotakenNodes: new Set(),
        autotakenNodesCP: 0,
        autotakenWorkerNodes: new Set(),
        autotakenWorkerNodesCP: 0,
        autotakenGrindNodes: new Set(),
        autotakenGrindNodesCP: 0,
        autotakenWagonNodes: new Set(),
        autotakenWagonNodesCP: 0,
        linkColors: {},
        pzWsJobs: {
          pz: {},
          ws: [],
          map: [],
          nodeUsedbyJob: {},
        },
      }

      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const userStore = useUserStore()

      // WC1. gather up the routees
      const firstUniques = new Set() // wasm router wants first arg to be unique
      const terminalPairs = []  // input of wasm noderouter
      const routees = [] // a routee can be either a grind node, a worker (pz/ws) or a wagon

      for (const routeeType of userStore.linkOrder) {
        if (routeeType.name == 'grind') {
          for (const nk of userStore.grindTakenList) {
            const profit = userStore.grindTakenValues[nk]
            routees.push({type: 'grind', nk, profit})
            terminalPairs.push([nk, 99999])
          }
        }
        if (routeeType.name == 'worker') {
          userStore.workingWorkers.forEach(worker => {
            const tnk = worker.tnk
            var nk
            if (gameStore.jobIsPz(worker.job)) {
              nk = worker.job.pzk
            }
            else if (gameStore.jobIsWorkshop(worker.job)) {
              const hk = worker.job.hk
              nk = gameStore.houseInfo[hk].parentNode
            }
            else return
            // "worker list" -> index -> order of building the link
            routees.push({type: 'worker', tnk, nk})
            if (nk != tnk) {
              if (firstUniques.has(nk)) console.log(`duplicate nk=${nk} may cause wasm to misbehave`)
              terminalPairs.push([nk, tnk])
              firstUniques.add(nk)
            }
          })
          if (userStore.activateAncado) {
            routees.push({type: 'ancado'})
            const nk = 1343
            if (firstUniques.has(nk)) console.log(`duplicate nk=${nk} may cause wasm to misbehave`)
            terminalPairs.push([nk, 99999])
          }
        }
        if (routeeType.name == 'wagon') {
          for (const wp of userStore.wagonRoutesProfits) {
            routees.push({type: 'wagon', ...wp})
            terminalPairs.push([wp.origin, wp.destination])
          }
        }
      }

      // WC2. perform the routing - get the big graph of all routees
      let activatedNodes = []
      if (terminalPairs.length > 0) {
        const startTime = performance.now()

        const [list1, cost1] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
        if (userStore.wasm.tryMoreFrontierRings) {
          gameStore.wasmRouter.setOption("max_frontier_rings", "5")
          const [list2, cost2] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
          gameStore.wasmRouter.setOption("max_frontier_rings", "3")
          activatedNodes = cost1 <= cost2 ? list1 : list2
          if (userStore.wasm.debugMoreFrontierRings) {
            console.log("cost1", cost1, "cost2", cost2)
          }
        }
        else {
          activatedNodes = list1
        }

        //console.log('terminalPairs for wasmRouter', terminalPairs)
        const took = performance.now() - startTime
        //console.log('wasm input', terminalPairs)
        //console.log('wasm output', activatedNodes)
        console.log('wasm took', took.toFixed(2), 'ms')
      }

      activatedNodes = this.applyWasmWorkarounds(activatedNodes, terminalPairs)

      // WC3. get the sub-graph of each routee
      const usedPaths = {}
      const paidNodes = new Set()
      for (const routee of routees) {
        if (routee.type == 'grind') {
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, routee.nk, 99999)
          let prev_nk = null
          for (const nk of usedPath) {
            if (!paidNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenGrindNodes.add(nk)
              ret.autotakenGrindNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'grind'
            prev_nk = nk
            paidNodes.add(nk)
          }
          const mapJob = new MapJobGrind(new Route(usedPath), new Profit(routee.profit), routee.nk)
          ret.pzWsJobs.map.push(mapJob)
        }
        if (routee.type == 'wagon') {
          const {origin, destination} = routee
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, destination, origin)
          let prev_nk = null
          for (const nk of usedPath) {
            if (!paidNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWagonNodes.add(nk)
              ret.autotakenWagonNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'wagon'
            prev_nk = nk
            paidNodes.add(nk)
          }
          const mapJob = new MapJobWagon(new Route(usedPath), new Profit(routee.profit), routee.origin, routee.destination)
          ret.pzWsJobs.map.push(mapJob)
        }
        if (routee.type == 'ancado') {
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, 1343, 99999)
          let prev_nk = null
          for (const nk of usedPath) {
            if (!paidNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWorkerNodes.add(nk)
              ret.autotakenWorkerNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'worker'
            prev_nk = nk
            paidNodes.add(nk)
          }
        }
        if (routee.type == 'worker') {  // expanded below
          const {nk, tnk} = routee
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, nk, tnk)
          usedPaths[tnk] ??= {}
          usedPaths[tnk][nk] = usedPath
          let prev_nk = null
          for (const nk of usedPath) {
            if (!paidNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
              ret.autotakenWorkerNodes.add(nk)
              ret.autotakenWorkerNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) ret.linkColors[(prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`] ??= 'worker'
            prev_nk = nk
            paidNodes.add(nk)
          }
        }
      }
      
      for (const worker of userStore.workingWorkers) {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) continue
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const usedPath = usedPaths[worker.tnk][pzk]
          const mapJob = new MapJobPlantzone(new Route(usedPath), profit, pzk, worker)
          ret.pzWsJobs.pz[pzk] = mapJob
          ret.pzWsJobs.map.push(mapJob)
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const nk = gameStore.houseInfo[hk].parentNode
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          const usedPath = usedPaths[worker.tnk][nk]

          let thriftyPercent = 0
          let thriftyWorks = false
          const rcp = worker.job.recipe
          if (gameStore.craftInputs && rcp in gameStore.craftInputs) {
            const inputs = gameStore.craftInputs[rcp]
            for (const ik of Object.keys(inputs)) {
              if (inputs[ik] >= 10) {
                thriftyWorks = true
              }
            }
            for (const sk of worker.skills) {
              if (sk > 0) {
                if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
              }
            }            
          }
          const mapJob = new MapJobWorkshop(new Route(usedPath), profit, hk, worker, thriftyWorks, thriftyPercent)
          ret.pzWsJobs.ws.push(mapJob)
          ret.pzWsJobs.map.push(mapJob)
        }
      }



      return ret
    },



    routingOld(state) {
      // old method - order-dependent dijkstra
      // grind nodes first, then worker jobs, then wagons
      // TODO: achieve CP sharing (when a connection node that is already activated by job A
      // gets reused by job B - split the CP cost proportional to cashflows)
      const ret = {
        autotakenNodes: new Set(),
        autotakenNodesCP: 0,
        autotakenWorkerNodes: new Set(),
        autotakenWorkerNodesCP: 0,
        autotakenGrindNodes: new Set(),
        autotakenGrindNodesCP: 0,
        autotakenWagonNodes: new Set(),
        autotakenWagonNodesCP: 0,
        linkColors: {},
        pzWsJobs: {
          pz: {},  // pzk => job
          ws: [],  // job, job
          map: [], // job, job
          nodeUsedbyJob: {},
        }
      }

      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const userStore = useUserStore()

      // O1. gather up the routees
      const routees = []

      for (const routeeType of userStore.linkOrder) {
        if (routeeType.name == 'grind') {
          for (const nk of userStore.grindTakenList) {
            const profit = userStore.grindTakenValues[nk] == "" ? 0 : userStore.grindTakenValues[nk]
            routees.push({type: 'grind', nk: Number(nk), profit})
          }
        }

        if (routeeType.name == 'worker') {
          for (const worker of userStore.workingWorkers) {
            if (gameStore.jobIsPz(worker.job)) {
              routees.push({type: 'worker', source: worker.tnk, target: worker.job.pzk})
            }
            else if (gameStore.jobIsWorkshop(worker.job)) {
              const hk = worker.job.hk
              const nk = gameStore.houseInfo[hk].parentNode
              routees.push({type: 'worker', source: worker.tnk, target: nk})
            }
          }
          if (userStore.activateAncado) {
            routees.push({type: 'ancado'})
          }
        }

        if (routeeType.name == 'wagon') {
          for (const wp of userStore.wagonRoutesProfits) {
            routees.push({type: 'wagon', ...wp})
          }
        }
      }

      // O2/3. perform the routing of sub-graphs
      const nodeUsedBy = {}

      const usedPaths = {}
      for (const routee of routees) {
        if (routee.type == 'grind') {
          const paths = gameStore.dijkstraNearestTowns(routee.nk, 4, ret.autotakenNodes, false, true)
          const list = paths.sort((a,b)=>a[1]-b[1])  // from lowest to highest CP
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          const mapJob = new MapJobGrind(new Route(usedPath), new Profit(routee.profit), routee.nk)
          ret.pzWsJobs.map.push(mapJob)
          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk] ??= []
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['grind'] ??= 0
              ret.linkColors[linkid]['grind'] += routee.profit
            }
            prev_nk = nk
          }
        }
        if (routee.type == 'wagon') {
          const [usedPath, usedPathCost] = gameStore.dijkstraPath(routee.destination, routee.origin, ret.autotakenNodes)
          if (!usedPath) continue
          const mapJob = new MapJobWagon(new Route(usedPath), new Profit(routee.profit), routee.origin, routee.destination)
          ret.pzWsJobs.map.push(mapJob)
          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk] ??= []
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['wagon'] ??= 0
              ret.linkColors[linkid]['wagon'] += routee.profit
            }
            prev_nk = nk
          }
          
        }
        if (routee.type == 'ancado') {
          const toTowns = gameStore.dijkstraNearestTowns(1343, 4, ret.autotakenNodes, false, true)
          const list = toTowns.sort((a,b)=>a[1]-b[1])
          //console.log('list', list)
          const [tnk, addCp, usedPath] = list[0]
          const mapJob = new MapJob(new Route(usedPath), new Profit(routee.profit))
          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk] ??= []
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += routee.profit
            }
            prev_nk = nk
          }
        }
        if (routee.type == 'worker') {  // expanded below
          const [usedPath, usedPathCost] = gameStore.dijkstraPath(routee.target, routee.source, ret.autotakenNodes)
          if (!usedPath) continue

          for (const nk of usedPath) {
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
          }
          usedPaths[routee.source] ??= {}
          usedPaths[routee.source][routee.target] = usedPath
        }
      }     
      
      for (const worker of userStore.workingWorkers) {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) continue
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const usedPath = usedPaths[worker.tnk][worker.job.pzk]
          const mapJob = new MapJobPlantzone(new Route(usedPath), profit, pzk, worker)
          ret.pzWsJobs.pz[pzk] = mapJob
          ret.pzWsJobs.map.push(mapJob)

          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk] ??= []
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += profit.priceDaily
            }
            prev_nk = nk
          }
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const nk = gameStore.houseInfo[hk].parentNode
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          let thriftyPercent = 0
          let thriftyWorks = false
          const rcp = worker.job.recipe
          if (gameStore.craftInputs && rcp in gameStore.craftInputs) {
            const inputs = gameStore.craftInputs[rcp]
            for (const ik of Object.keys(inputs)) {
              if (inputs[ik] >= 10) {
                thriftyWorks = true
              }
            }
            for (const sk of worker.skills) {
              if (sk > 0) {
                if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
              }
            }
          }
          const usedPath = usedPaths[worker.tnk][nk]
          const mapJob = new MapJobWorkshop(new Route(usedPath), profit, hk, worker, thriftyWorks, thriftyPercent)
          ret.pzWsJobs.ws.push(mapJob)
          ret.pzWsJobs.map.push(mapJob)

          let prev_nk = null
          for (const nk of usedPath) {
            nodeUsedBy[nk] ??= []
            nodeUsedBy[nk].push({ mapJob, share: NaN })
            if (!ret.autotakenNodes.has(nk)) {
              ret.autotakenNodes.add(nk)
              ret.autotakenNodesCP += gameStore.nodes[nk].CP
            }
            if (prev_nk) {
              const linkid = (prev_nk < nk) ? `${prev_nk}-${nk}` : `${nk}-${prev_nk}`
              ret.linkColors[linkid] ??= {}
              ret.linkColors[linkid]['worker'] ??= 0
              ret.linkColors[linkid]['worker'] += profit.priceDaily
            }
            prev_nk = nk
          }
        }
      }

      // O4. calculate sharing
      // this is already done in `nodesUsedBy`, but
      // needs to be done here as well to calculate fractional CP totals

      const nodeTotalProfit = {}
      for (const [nk, ownerships] of Object.entries(nodeUsedBy)) {
        nodeTotalProfit[nk] = 0
        for (const ownership of ownerships) {
          nodeTotalProfit[nk] += ownership.mapJob.profit.priceDaily
        }

        for (const ownership of ownerships) {
          ownership.share = ownership.mapJob.profit.priceDaily / nodeTotalProfit[nk]
          const cpFraction = gameStore.nodes[nk].CP * ownership.share
          if (ownership.mapJob instanceof MapJobPlantzone) ret.autotakenWorkerNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobWorkshop) ret.autotakenWorkerNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobGrind) ret.autotakenGrindNodesCP += cpFraction
          if (ownership.mapJob instanceof MapJobWagon) ret.autotakenWagonNodesCP += cpFraction
        }
      }

      return ret
    },



    


    // used EVERYWHERE
    pzJobs(state) {
      return state.routing.pzWsJobs.pz
    },

    // used to display selected town-remote workshops lines
    wsJobs(state) {
      return state.routing.pzWsJobs.ws
    },

    // used:
    // - to display sharing info in selected node pane 
    // - for shared CP calculation
    mapJobs(state) {
      return state.routing.pzWsJobs.map
    },

    // used for MapSelectedInfo
    nodeUsedByJob(state) {
      return state.routing.pzWsJobs.nodeUsedByJob
    },


    currentNodesCashflow(state) {
      const cashFlows = {}
      for (const job of state.mapJobs) {
        if (job?.route?.usedPath) {
          for (const nk of job.route.usedPath) {
            if (!cashFlows[nk]) cashFlows[nk] = 0
            cashFlows[nk] += job.profit.priceDaily
          }
        } else {
          console.log(job, `has no route`)
        }
      }
      //console.log('currentNodesCashflow', cashFlows)
      return cashFlows
    },

    // shown when clicking a connection node (both in infopane and map paths highlight)
    // - priority changes nothing
    nodesUsedBy(state) {
      const nodesJobs = {}
      for (const mapJob of state.mapJobs) {
        if (mapJob.route.usedPath) {
          for (const nk of mapJob.route.usedPath) {
            if (!nodesJobs[nk]) nodesJobs[nk] = []
            nodesJobs[nk].push(mapJob)
          }
        }
      }
      return nodesJobs
    },

    // shown when clicking a plantzone
    // - if Priority is ON, does not share the nodes of the path that were paid for by Grind or Wagon category
    // - if Priority is OFF (or no other job paid for the nodes) shares everything
    pzjobsSharedConnectionCP(state) {
      const ret = {}
      const gameStore = useGameStore()
      for (const [pzk, job] of Object.entries(state.pzJobs)) {
        ret[pzk] = { value: 0, tooltip: "" }
        if (job.route.usedPath) {
          for (const nk of job.route.usedPath) {
            if (state.routing.autotakenGrindNodes.has(nk)) continue
            if (state.routing.autotakenWagonNodes.has(nk)) continue
            const nodeCostShare = job.profit.priceDaily / state.currentNodesCashflow[nk]
            const nodeCostShared = gameStore.nodes[nk].CP * nodeCostShare
            ret[pzk].value += nodeCostShared
            ret[pzk].tooltip += `${formatFixed(nodeCostShared, 3)} ${gameStore.nodeName(nk)}\n`
          }
        }
      }
      //console.log('pzjobsSharedConnectionCP', ret)
      return ret
    },

    wagonCpCosts(state) {
      const ret = {}
      const gameStore = useGameStore()
      const userStore = useUserStore()
      for (const mjw of state.mapJobs) {
        if (mjw instanceof MapJobWagon) {
          const origin = userStore.townStat[mjw.nk_orig].reverseConnection ? mjw.nk_dest : mjw.nk_orig
          ret[origin] ??= { value: 0, tooltip: "" }
          for (const nk of mjw.route.usedPath) {
            const nodeCostShare = mjw.profit.priceDaily / state.currentNodesCashflow[nk]
            const nodeCostShared = gameStore.nodes[nk].CP * nodeCostShare
            ret[origin].value += nodeCostShared
            ret[origin].tooltip = `${formatFixed(nodeCostShared, 3)} ${gameStore.nodeName(nk)}\n` + ret[origin].tooltip
          }
        }
      }
      console.log('wagonCpCosts', ret)
      return ret
    },
  }

});
