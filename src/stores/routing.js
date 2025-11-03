import {defineStore} from "pinia";
import {useGameStore} from './game.js'
import {useUserStore} from './user.js'
import {formatFixed} from '../util.js'

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
      return userStore.wasmRouting ? state.routingWasm : state.routingOld
    },

    routingWasm(state) {
      // wasm routing (by thell)
      // simultaneous but in configurable order
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
        }
      }

      const gameStore = useGameStore()
      if (!gameStore.ready) return ret
      const userStore = useUserStore()

      const firstUniques = new Set() // wasm router wants first arg to be unique
      const terminalPairs = []  // input of wasm noderouter
      const routees = [] // a routee can be either a grind node, a worker (pz/ws) or a wagon

      for (const routeeType of userStore.linkOrder) {
        if (routeeType.name == 'grind') {
          for (const nk of userStore.grindTakenList) {
            routees.push({type: 'grind', nk})
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
              const houseTk = gameStore.houseInfo[hk].affTown
              const houseTnk = gameStore.tk2tnk(houseTk)
              nk = houseTnk
            }
            else return
            // "worker list" -> index -> order of building the link
            routees.push({type: 'worker', tnk, nk})
            if (nk != tnk) {
              if (firstUniques.has(nk)) {
                console.log(`duplicate nk=${nk} may cause wasm to misbehave`)
              }
              terminalPairs.push([nk, tnk])
              firstUniques.add(nk)
            }
          })
          if (userStore.activateAncado) {
            routees.push({type: 'ancado'})
            const nk = 1343
            if (firstUniques.has(nk)) {
              console.log(`duplicate nk=${nk} may cause wasm to misbehave`)
            }
            terminalPairs.push([nk, 99999])
          }
        }
        if (routeeType.name == 'wagon') {
          for (const {origin, destination} of userStore.wagonRoutes) {
            console.log('push wagon', origin, destination)
            routees.push({type: 'wagon', origin, destination})
            // wasm router wants first arg to be unique, but we enforce that by 
            // only alowing single origin to have single destination in the UI
            terminalPairs.push([origin, destination])
          }
        }
      }

      let activatedNodes = []
      if (terminalPairs.length > 0) {
        const startTime = performance.now()

        const [list1, cost1] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
        if (userStore.wasm.tryMoreFrontierRings) {
          gameStore.wasmRouter.setOption("max_frontier_rings", "4")
          const [list2, cost2] = gameStore.wasmRouter.solveForTerminalPairs(terminalPairs)
          gameStore.wasmRouter.setOption("max_frontier_rings", "3")
          activatedNodes = cost1 <= cost2 ? list1 : list2
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

      const routeInfos = {}
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
        }
        if (routee.type == 'worker') {
          const {nk, tnk} = routee
          const [usedPath, usedPathCost] = gameStore.miniDijkstra(activatedNodes, nk, tnk)
          const routeInfo = { usedPath, usedPathCost }
          if (!(tnk in routeInfos)) routeInfos[tnk] = {}
          routeInfos[tnk][nk] = routeInfo
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
        }
      }

      /*console.log('linkColors', ret.linkColors)
      console.log('autotakenNodes', ret.autotakenNodes, ret.autotakenNodesCP)
      console.log('autotakenGrindNodes', ret.autotakenGrindNodes, ret.autotakenGrindNodesCP)
      console.log('autotakenWagonNodes', ret.autotakenWagonNodes, ret.autotakenWagonNodesCP)*/
      
      userStore.workingWorkers.forEach(worker => {
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
          ret.pzWsJobs.pz[pzk] = job
          ret.pzWsJobs.map.push(job)
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const houseTk = gameStore.houseInfo[hk].affTown
          const houseTnk = gameStore.tk2tnk(houseTk)
          const profit = gameStore.profitWorkshopWorker(hk, workshop, worker)
          const route = routeInfos[worker.tnk][houseTnk]

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
            if (thriftyWorks) {
              for (const sk of worker.skills) {
                if (sk > 0) {
                  if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                  if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                  if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
                }
              }
            }
          }

          const job = {
            hk,
            worker,
            profit,
            thriftyPercent,
            ...route
          }
          ret.pzWsJobs.ws.push(job)
          ret.pzWsJobs.map.push(job)
        }
      })

      return ret
    },

    routingOld(state) {
      // old method - order-dependent dijkstra
      // grind nodes first, then worker jobs, then wagons
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

      
      const routees = []

      for (const routeeType of userStore.linkOrder) {
        if (routeeType.name == 'grind') {
          for (const nk of userStore.grindTakenList) {
            routees.push({type: 'grind', nk})
          }
        }

        if (routeeType.name == 'worker') {
          for (const worker of userStore.workingWorkers) {
            if (gameStore.jobIsPz(worker.job)) {
              routees.push({type: 'worker', source: worker.tnk, target: worker.job.pzk})
            }
            else if (gameStore.jobIsWorkshop(worker.job)) {
              const hk = worker.job.hk
              const houseTk = gameStore.houseInfo[hk].affTown
              const houseTnk = gameStore.tk2tnk(houseTk)
              routees.push({type: 'worker', source: worker.tnk, target: houseTnk})
            }
          }
          if (userStore.activateAncado) {
            routees.push({type: 'ancado'})
          }
        }

        if (routeeType.name == 'wagon') {
          for (const {origin, destination} of userStore.wagonRoutes) {
            routees.push({type: 'wagon', source: origin, target: destination})
          }
        }
      }

      const routed = gameStore.routeOld(ret.autotakenGrindNodes, routees)
      ret.autotakenNodes = routed.autotakenNodes
      ret.autotakenNodesCP = routed.autotakenNodesCP
      ret.autotakenWorkerNodes = routed.autotakenWorkerNodes
      ret.autotakenWorkerNodesCP = routed.autotakenWorkerNodesCP
      ret.autotakenGrindNodes = routed.autotakenGrindNodes
      ret.autotakenGrindNodesCP = routed.autotakenGrindNodesCP
      ret.autotakenWagonNodes = routed.autotakenWagonNodes
      ret.autotakenWagonNodesCP = routed.autotakenWagonNodesCP
      ret.linkColors = routed.linkColors
      
      for (const worker of userStore.workingWorkers) {
        if (gameStore.jobIsPz(worker.job)) {
          const pzk = worker.job.pzk
          if (!pzk) continue
          const stats = gameStore.workerStatsOnPlantzone(worker)
          const profit = gameStore.profitPzTownStats(pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, gameStore.isGiant(worker.charkey))
          const route = routed.routeInfos[worker.tnk][worker.job.pzk]
          const job = {
            pzk,
            worker,
            profit,
            ...route
          }
          ret.pzWsJobs.pz[pzk] = job
          ret.pzWsJobs.map.push(job)
        }
        else if (gameStore.jobIsWorkshop(worker.job)) {
          const hk = worker.job.hk
          const workshop = userStore.getUserWorkshop(hk)
          const houseTk = gameStore.houseInfo[hk].affTown
          const houseTnk = gameStore.tk2tnk(houseTk)
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
            if (thriftyWorks) {
              for (const sk of worker.skills) {
                if (sk > 0) {
                  if ('thrifty5' in gameStore.skillData[sk]) thriftyPercent += 5
                  if ('thrifty7' in gameStore.skillData[sk]) thriftyPercent += 7
                  if ('thrifty10' in gameStore.skillData[sk]) thriftyPercent += 10
                }
              }
            }
          }
          const route = routed.routeInfos[worker.tnk][houseTnk]
          const job = {
            hk,
            worker,
            profit,
            thriftyPercent,
            ...route
          }
          ret.pzWsJobs.ws.push(job)
          ret.pzWsJobs.map.push(job)
        }
      }      

      console.log('autotakenGrindNodes', ret.autotakenGrindNodes)
      ret.autotakenGrindNodesCP = [...ret.autotakenGrindNodes].reduce((acc, nk) => acc + gameStore.nodes[nk].CP, 0)
      console.log('autotakenGrindNodesCP', ret.autotakenGrindNodesCP)

      console.log('autotakenWagonNodes', ret.autotakenWagonNodes)
      ret.autotakenWagonNodesCP = [...ret.autotakenWagonNodes].reduce((acc, nk) => acc + gameStore.nodes[nk].CP, 0)
      console.log('autotakenWagonNodesCP', ret.autotakenWagonNodesCP)

      console.log('autotakenNodes', ret.autotakenNodes)
      ret.autotakenNodesCP = [...ret.autotakenNodes].reduce((acc, nk) => acc + gameStore.nodes[nk].CP, 0)
      console.log('autotakenNodesCP', ret.autotakenNodesCP)

      return ret
    },


    // used EVERYWHERE
    pzJobs(state) {
      return state.routing.pzWsJobs.pz
    },

    // used to display town-remote workshop line
    wsJobs(state) {
      return state.routing.pzWsJobs.ws
    },

    // used to display sharing info in selected node pane and for shared CP calculation
    mapJobs(state) {
      return state.routing.pzWsJobs.map
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
            if (state.routing.autotakenGrindNodes.has(nk)) {
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
  }

});
