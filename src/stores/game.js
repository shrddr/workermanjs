import {defineStore} from "pinia";
import {useMarketStore} from './market'
import {useUserStore} from './user'
import Heap from 'heap';
import {extractNumbers, binarySearch} from '../util.js';
import init, { WasmNodeRouter } from '../pkg/noderouter.js';

export const useGameStore = defineStore({
  id: "game",
  state: () => ({
    ready: false,
    plantzoneDrops: {},
    pzdSet: null,
    plantzoneStatic: {},
    itemKeys: [],
    nodes: {},
    distPerTown: {},
    distToTown: {},
    lodgingPerTown: {},
    houseInfo: {},
    regionInfo: {},
    townsConnectionRoots: new Set(),
    townsWithLodging: [],
    townsWithRentableStorage: [],
    townsWithRedirectableStorage: [],
    townNames: {},
    regionGroups: {},
    loc: {},
    links: {},
    icons: {},
    workerStatic: {},
    skillData: {},
    vendorPrices: {},
    _tk2tnk: {},
    _tnk2tk: {},
    craftInputs: {},
    craftOutputs: {},
    wasmNodesLinks: {},
    wasmBaseTowns: new Set(),
    wasmRouter: null,
  }),
  
  actions: {
    availableSkillPool(haveSkills, skillToChange) {
      const haveSet = new Set(haveSkills)
      //console.log(haveSkills)
      if (skillToChange)
        haveSet.delete(skillToChange)
      const ret = this.skillKeys
        .filter(sk => !(haveSet.has(sk)))
      //console.log(skillToChange, ret)
      return ret
    },
    randomSkill(haveSkills) {
      const pool = this.availableSkillPool(haveSkills)
      const ret = pool[Math.floor(Math.random()*pool.length)]
      //console.log('random skill', ret)
      return ret
    },
    wspdBonusOnPlantzone(w) {
      let ret = 0
      if (!this.ready) return ret
      w.skills.forEach(sk => {
        const skillBonuses = this.skillData[sk]
        if (skillBonuses === undefined)
          return
        if ('wspd' in skillBonuses) ret += skillBonuses['wspd']
        if ('wspd_farm' in skillBonuses) ret += skillBonuses['wspd_farm']
      })
      return ret
    },
    wspdBonus(w, industry) {
      let ret = 0
      if (!this.ready) return ret
      w.skills.forEach(sk => {
        const skillBonuses = this.skillData[sk]
        if (skillBonuses === undefined)
          return
        if ('wspd' in skillBonuses) ret += skillBonuses['wspd']
        if ('wspd_'+industry in skillBonuses) ret += skillBonuses['wspd_'+industry]
        if ('wspd_refine' in skillBonuses && industry.startsWith('pack_')) ret += skillBonuses['wspd_refine']
      })
      //console.log('wspdBonus', w.label, industry, ret)
      return ret
    },
    mspdBonus(w) {
      let ret = 0
      if (!this.ready) return ret
      w.skills.forEach(sk => {
        const skillBonuses = this.skillData[sk]
        if (skillBonuses === undefined)
          return
        if ('mspd' in skillBonuses) ret += skillBonuses['mspd']
      })
      return ret
    },
    luckBonus(w) {
      let ret = 0
      if (!this.ready) return ret
      w.skills.forEach(sk => {
        const skillBonuses = this.skillData[sk]
        if (skillBonuses === undefined)
          return
        if ('luck' in skillBonuses) ret += skillBonuses['luck']
      })
      return ret
    },
    workerStatsOnPlantzone(w) {
      if (!this.ready) return {
        wspd: 0,
        mspd: 0,
        luck: 0,
      }
      return {
        wspd: w.wspdSheet + this.wspdBonusOnPlantzone(w),
        mspd: (this.workerStatic[w.charkey].mspd/100) * ((w.mspdSheet / (this.workerStatic[w.charkey].mspd/100)) + this.mspdBonus(w) / 100),
        luck: w.luckSheet + this.luckBonus(w)
      }
    },
    workerStatsOnIndustry(w, industry) {
      if (!this.ready) return {
        wspd: 0,
        mspd: 0,
        luck: 0,
      }
      return {
        wspd: w.wspdSheet + this.wspdBonus(w, industry),
        mspd: (this.workerStatic[w.charkey].mspd/100) * ((w.mspdSheet / (this.workerStatic[w.charkey].mspd/100)) + this.mspdBonus(w) / 100),
        luck: w.luckSheet + this.luckBonus(w)
      }
    },
    workerStatsOnCurrentJob(w) {
      var industry = 'farm'
      if (this.jobIsWorkshop(w.job)) {
        const userStore = useUserStore()
        const hk = w.job.hk
        if (!(hk in userStore.userWorkshops)) {
          userStore.userWorkshops[hk] = { ...userStore.defaultUserWorkshop }
        }
        industry = userStore.userWorkshops[hk].industry
      }

      return {
        wspd: w.wspdSheet + this.wspdBonus(w, industry),
        mspd: (this.workerStatic[w.charkey].mspd/100) * ((w.mspdSheet / (this.workerStatic[w.charkey].mspd/100)) + this.mspdBonus(w) / 100),
        luck: w.luckSheet + this.luckBonus(w)
      }
    },

    workerStatRank(w) {
      const levelups = w.level - 1
      const stat_base = this.workerStatic[w.charkey]

      const wspd_lo_total_base = stat_base.wspd_lo * levelups
      const wspd_hi_total_base = stat_base.wspd_hi * levelups
      const wspd_range_base = wspd_hi_total_base - wspd_lo_total_base
      const wspd_total_cur = (w.wspdSheet*1E6 - stat_base.wspd)
      const wspd_rank = ((wspd_total_cur - wspd_lo_total_base) / wspd_range_base) || 0

      const mspd_lo_total_base = stat_base.mspd_lo * levelups
      const mspd_hi_total_base = stat_base.mspd_hi * levelups                                           
      const mspd_total_cur = ((w.mspdSheet / (stat_base.mspd/100)) - 1) * 1E6
      const mspd_rank = ((mspd_total_cur - mspd_lo_total_base) / (mspd_hi_total_base - mspd_lo_total_base)) || 0
      
      const luck_lo_total_base = stat_base.luck_lo * levelups
      const luck_hi_total_base = stat_base.luck_hi * levelups
      const luck_total_cur = (w.luckSheet*1E4 - stat_base.luck)
      const luck_rank = ((luck_total_cur - luck_lo_total_base) / (luck_hi_total_base - luck_lo_total_base)) || 0

      return {
        wspd_rank,
        mspd_rank,
        luck_rank,
      }
    },

    houseLodging(hk) {
      const t = this.houseInfo[hk].CraftList[1] ?? 0
      const v = {0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8}
      //console.log(hk, t)
      return v[t]
    },

    houseStorage(hk) {
      const t = this.houseInfo[hk].CraftList[2] ?? 0
      const v = {0: 0, 1: 3, 2: 5, 3: 8, 4: 12, 5: 16}
      return v[t]
    },

    houseCost(hk) {
      //console.log('houseCost', hk)
      const t = (this.houseInfo[hk] && this.houseInfo[hk].CP) ?? NaN
      return t
    },

    async fetchData() {
      const start = Date.now()

      // observed
      this.plantzoneDrops = await (await fetch(`data/manual/plantzone_drops.json`)).json()
      this.pzdSet = new Set(Object.keys(this.plantzoneDrops).map(x=>+x))
      //console.log('pzdSet', this.pzdSet)

      // from client
      this.plantzoneStatic = await (await fetch(`data/plantzone.json`)).json()
      console.log('plantzoneStatic', this.plantzoneStatic[1879])

      // info for sorting
      this.itemInfo = await (await fetch(`data/item_info.json`)).json()

      // from drops (could have calculated in here)
      this.itemKeys = await (await fetch(`data/manual/plantzone_uniques.json`)).json()
      // this could be faster than loading an additional file but includes the Worker Seal
      //this.itemKeys = Object.keys(this.itemInfo).map((s) => parseInt(s)).sort((a,b)=>a-b)

      // for node parent name (todo: localization)
      this.nodes = await (await fetch(`data/exploration.json`)).json()

      // for later custom-worker-based profit
      this.tk2pzk = await (await fetch(`data/distances_tk2pzk.json`)).json()
      // for distance lookup starting with nearest towns
      this.pzk2tk = await (await fetch(`data/distances_pzk2tk.json`)).json()

      // for workshop distances (outdated)
      //this.hk2nk = await (await fetch(`data/hk2nk.json`)).json()
      // for specific worker show different workshops
      //this.tk2nk = await (await fetch(`data/distances_tk2nk.json`)).json()
      
      // best worker for a workshop
      //this.hk2tk = await (await fetch(`data/distances_hk2tk.json`)).json()
      // best workshop for a worker
      this.tk2hk = await (await fetch(`data/distances_tk2hk.json`)).json()

      this.regionInfo = await (await fetch(`data/regioninfo.json`)).json()
      Object.values(this.regionInfo).forEach(({ key, waypoint }) => {
        if (waypoint !== 0) {
          this._tk2tnk[key] = waypoint
          this._tnk2tk[waypoint] = key
        }
      })

      // the notion of "town" is highly ambiguous
      // 1) a node which is activated automatically by visiting (Tarif = yes, Abun = no)
      // 2) a node that has rentable worker lodging
      // 3) a node that has rentable item storage
      // 3a) ..and can be a target of lvl40 worker "stash redirect" feature (will ancado be a valid target when activated?)
      // 4) a node that has ANY kind of rentable housing (residence, workshop...)

      // town(1) can be used as grind node connection root
      this.townsConnectionRoots = new Set(
        Object.keys(this.nodes)
          .filter(sk => this.nodes[sk].kind > 0 && this.nodes[sk].kind < 3 && this.nodes[sk].CP === 0)
          .map(sk => this.nodes[sk].key)
      )

      // town(1+2) can be used as plantzone connection root
      // vel, olv, hei, gli, cal, kep
      // eph, tre, ili, alt, tar, val
      // sha, baz, anc, are, owt, gra         <-- ancado doesn't match criteria 1, but if you managed to put
      // duv, odd,      eil,                  a worker there, it is already connected to a proper town
      // tal, mut, ric, 
      //
      // yuk, god, buk
      // asp, muz
      this.townsWithLodging = [
        1,   61,  301, 302, 601, 602,
        604, 608, 1002,1101,1141,1301,
        1314,1319,1343,1380,1604,1623,
        1649,1691,     1750, 
        1781,1785,1795,
        // 1727,1834,1843,1850,  // can provide storage, cannot house workers
        // 1001, // lema costs cp, cannot provide storage, cannot house workers
        1853,1857,1858,
        1834,1843,
        2001
      ]
      // town(1+2) again, but tk-based (TODO: unify)
      this.lodgingPerTown = await (await fetch(`data/lodging_per_town.json`)).json()


      // town(3) has config button where you can enter "Personal items" value
      // vel, olv, hei, gli, cal, kep
      // eph, tre, ili, alt, tar, val
      // sha, baz, anc, are, owt, gra
      // duv, odd, oqi, eil, 
      // tal, mut, ric, 
      // yuk, god
      // asp, muz
      this.townsWithRentableStorage = [
        1,   61,  301, 302, 601, 602,
        604, 608, 1002,1101,1141,1301,
        1314,1319,1343,1380,1604,1623,
        1649,1691,1727,1750, 
        1781,1785,1795,
        1853,1857,
        1834,1843,
        2001
      ]

      // town(3a) can be a target of "stash redirect" feature, filled manually
      // vel, olv, hei, gli, cal, kep
      // eph, tre, ili, alt, tar, val
      // sha, baz, anc, are, owt, gra
      // duv, odd, oqi, eil, 
      // tal, mut, ric, 
      // asf, muz, ber
      // yuk, god, buk
      this.townsWithRedirectableStorage = [
        1,   61,  301, 302, 601, 602,
        604, 608, 1002,1101,1141,1301,
        1314,1319,1343,1380,1604,1623,
        1649,1691,1727,1750, 
        1781,1785,1795,
        1834,1843,1850,
        1853,1857,1858,
        2001
      ]

      // town(4) can be extracted from here if needed
      this.houseInfo = await (await fetch(`data/houseinfo.json`)).json()

      this.vendorPrices = await (await fetch(`data/manual/vendor_prices.json`)).json()      

      this.industries = {
        "unk": "unknown",
        "jewelry": "jewelry",
        "mass": "mass production",
        "weap": "weapon",
        "tool": "tool",
        "furn": "furniture",
        "costume": "costume",
        "refine": "refine",
        "siege": "siege",
        "mount": "mount",
        "exclus": "exclusive",
        "pack_produce": "pack_produce",
        "pack_herb": "pack_herb",
        "pack_mushr": "pack_mushr",
        "pack_fish": "pack_fish",
        "pack_timber": "pack_timber",
        "pack_ore": "pack_ore",
      }

      // for resources view, calculated from pzStatic
      const regionGroups = {}
      for (const [key, value] of Object.entries(this.plantzoneStatic)) {
        if (key in this.plantzoneDrops) {
          const rgroup = value.regiongroup
          if (rgroup in regionGroups)
            regionGroups[rgroup].push(key)
          else
            regionGroups[rgroup] = [key]
        }
      }
      this.regionGroups = regionGroups

      this.skillData = await (await fetch(`data/manual/skills.json`)).json()
      this.workerStatic = await (await fetch(`data/worker_static.json`)).json()
      this.loc = await (await fetch(`data/loc.json`)).json()
      
      // these are used in dijkstra; deck links are loaded in NodeMap
      this.links = await (await fetch(`data/links.json`)).json()

      this.ls_lookup = await (await fetch(`data/all_lodging_storage.json`)).json()
      this.ls_lodgings_sorted = {}
      for (const [tk, lodging_dict] of Object.entries(this.ls_lookup)) {
        this.ls_lodgings_sorted[tk] = Object.keys(lodging_dict).sort((a, b) => a - b)
      }

      this.giantSpecies = new Set([2, 4, 8])
      this.speciesIcons = {
        0: '👺',
        1: '👨',
        2: '🐢',
        3: '👺',  // kama
        4: '🐢',  // kama
        5: '👺',  // oddy
        6: '👺',  // lotml
        7: '👨',  // lotml
        8: '🐢',  // lotml
      }

      this.craftInputs = await (await fetch(`data/house_craft_inputs.json`)).json()
      this.craftOutputs = await (await fetch(`data/house_craft_outputs.json`)).json()
      this.craftInfo = await (await fetch(`data/house_craft_info.json`)).json()

      this.craftInputItemKeySet = new Set()
      for (const inputs of Object.values(this.craftInputs)) {
        for (const ik of Object.keys(inputs)) {
          this.craftInputItemKeySet.add(Number(ik))
        }
      }
      //console.log('craftInputItemKeySet', this.craftInputItemKeySet)

      this.traders = await (await fetch(`data/manual/traders.json`)).json()

      await this.initWasmRouter()
      
      this.ready = true

      console.log('fetchGame took', Date.now()-start, 'ms')
    },

    async initWasmRouter() {
      this.wasmBaseTowns = new Set()

      //const nodesLinks = await (await fetch(`data/nodes_links.json`)).json()
      const nodesLinks = {}

      for (const [nk, link_list] of Object.entries(this.links)) {
        nodesLinks[nk] = { link_list }
      }
      for (const [nk, nd] of Object.entries(this.nodes)) {
        if (nk in nodesLinks) {
          const is_base_town = (0 < nd.kind) && (nd.kind < 3) && (nd.CP == 0)
          if (is_base_town) this.wasmBaseTowns.add(nd.key)
          nodesLinks[nk].waypoint_key = nd.key
          nodesLinks[nk].need_exploration_point = nd.CP
          nodesLinks[nk].is_base_town = is_base_town
        }
      }
      //console.log('wasm init data', nodesLinks)
      await init()
      this.wasmRouter = new WasmNodeRouter(nodesLinks)
    },

    isGiant(charkey) {
      if (this.ready) {
        return this.giantSpecies.has(this.workerStatic[charkey].species)
      }
    },

    tk2tnk(tk) {
      if (this.ready) {
        if (tk in this._tk2tnk) {
          return this._tk2tnk[tk]
        }
        else {
          console.log('unknown tk', tk)
        }
      }
    },

    tnk2tk(tnk) {
      if (this.ready) {
        return this._tnk2tk[tnk]
        /*if (tnk in this._tnk2tk) {
          return this._tnk2tk[tnk]
        }
        else {
          console.log('unknown tnk', tnk)
        }*/
      }
    },

    // unused
    /*dijTownsInCpRadius(start, cpLimit) {
      //const ts = Date.now()

      const pathCosts = {[start]: userStore.autotakenNodes.has(start) ? 0 : this.nodes[start].CP}
      const prev = {[start]: null}
      const unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unvisited.push(start)
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        if (pathCosts[current] >= cpLimit)
          break
        this.links[current].forEach(neighbor => {
          const newDistance = pathCosts[current] + this.nodes[neighbor].CP
          if (neighbor in pathCosts) {
            // already met before, already in heap
            if (newDistance < pathCosts[neighbor]) {
              pathCosts[neighbor] = newDistance
              needTakes[neighbor] = [...needTakes[current], neighbor]
            }
          }
          else {
            pathCosts[neighbor] = newDistance
            needTakes[neighbor] = [...needTakes[current], neighbor]
            unvisited.push(neighbor)
          }
        })
      }

      const ret = {}
      this.towns.forEach(tnk => {
        if (tnk in pathCosts)
          ret[tnk] = pathCosts[tnk]
      })
      //console.log('dijTownsInCpRadius took', Date.now()-ts, 'ms')
      return ret
    },*/

    // for sendWorkers & Empire Next
    dijDiscountedNearestPlantzones(start, pzLimit) {
      if (!this.ready)
        return
      //const ts = Date.now()
      const userStore = useUserStore()
      let found = new Set()

      const pathCosts = {[start]: userStore.autotakenNodes.has(start) ? 0 : this.nodes[start].CP}
      const prev = {[start]: null}
      const unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unvisited.push(start)
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        
        if (this.pzdSet.has(current) && !userStore.autotakenNodes.has(current)) {
          found.add(current)
          if (found.size == pzLimit) {
            break
          }
        }
          
        this.links[current].forEach(neighbor => {
          const nbrCost = userStore.autotakenNodes.has(neighbor) ? 0 : this.nodes[neighbor].CP
          const newDistance = pathCosts[current] + nbrCost
          if (neighbor in pathCosts) {
            // already met before, already in heap
            if (newDistance < pathCosts[neighbor]) {
              pathCosts[neighbor] = newDistance
              prev[neighbor] = current
            }
          }
          else {
            pathCosts[neighbor] = newDistance
            prev[neighbor] = current
            unvisited.push(neighbor)  // note order, must have access
          }
        })
      }

      const ret = []
      found.forEach(nk => {
        const needTakes = [nk]
        let cur = nk
        while (prev[cur] !== null) {
          needTakes.push(prev[cur])
          cur = prev[cur]
        }
        ret.push([nk, pathCosts[nk], needTakes.reverse()])
      })
      //console.log('dijDiscountedNearestPlantzones took', Date.now()-ts, 'ms')
      //console.log('dijDiscountedNearestPlantzones', ret)
      return ret
    },

    // for pzJobs
    // can't use userStore.autoTaken - dependency loop
    dijkstraPath(start, finish, takens) {
      if (!this.ready)
        return [null, 0]
      const ts = Date.now()

      const prev = {[start]: null}
      const pathCosts = {[start]: takens && takens.has(start) ? 0 : this.nodes[start].CP}
      const unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unvisited.push(start)
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        if (current == finish)
          break
          
        this.links[current].forEach(neighbor => {
          //const nbrCost = this.nodes[neighbor].CP
          if (this.nodes[neighbor] == undefined)
            console.log('dijkstraPath: no exploration node', neighbor)
          const nbrCost = takens && takens.has(neighbor) ? 0 : this.nodes[neighbor].CP
          const newDistance = pathCosts[current] + nbrCost
          if (neighbor in pathCosts) {
            // already met before, already in heap
            if (newDistance < pathCosts[neighbor]) {
              pathCosts[neighbor] = newDistance
              prev[neighbor] = current
            }
          }
          else {
            pathCosts[neighbor] = newDistance
            prev[neighbor] = current
            unvisited.push(neighbor)  // note order, must have access
          }
        })
      }
      //console.log('dijkstraPath took', Date.now()-ts, 'ms')
      //if (start == 1216)
        //console.log('dijkstraPath 1216', takens.has(324), needTakes[finish])
      const needTakes = [finish]
      let cur = finish
      while (prev[cur] !== null) {
        needTakes.push(prev[cur])
        cur = prev[cur]
      }
      return [needTakes.reverse(), pathCosts[finish]]
    },


    // used for:
    // plantzoneNearestTownsFreeWorkersProfits, workshopNearestTownsFreeWorkersProfits, 
    // autotakenGrindNodes, allPlantzonesNearestCpTownProfit
    dijkstraNearestTowns(start, townLimit, takens, mustHaveLodging, skipAncado, noOceanCrossing) {
      if (!this.ready)
        return
      //const ts = Date.now()
      let found = new Set()

      const prev = {[start]: null}
      const pathCosts = {[start]: takens && takens.has(start) ? 0 : this.nodes[start].CP}
      const unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unvisited.push(start)
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        
        if (this.townsConnectionRoots.has(current)) {
          if (!mustHaveLodging || this.townsWithLodgingSet.has(current)) {
            if (current != 1343 || !skipAncado) {
              found.add(current)
              if (found.size == townLimit) break
            }
          }
        }

        this.links[current].forEach(neighbor => {
          if (this.nodes[neighbor] == undefined)
            throw Error(`dijkstraNearestTowns: unknown exploration node ${neighbor}`)
          if (noOceanCrossing) {
            if ((current == 1727 && neighbor == 1800) || (current == 1800 && neighbor == 1727)) {
              //console.log('skipping ocean link')
              return
            } 
          }
          const nbrCost = takens && takens.has(neighbor) ? 0 : this.nodes[neighbor].CP
          const newDistance = pathCosts[current] + nbrCost
          if (neighbor in pathCosts) {
            // already met before, already in heap
            if (newDistance < pathCosts[neighbor]) {
              pathCosts[neighbor] = newDistance
              prev[neighbor] = current
            }
          }
          else {
            pathCosts[neighbor] = newDistance
            prev[neighbor] = current
            unvisited.push(neighbor)  // note order, must have access
          }
        })
      }

      const ret = []
      found.forEach(tnk => {
        const needTakes = [tnk]
        let cur = tnk
        while (prev[cur] !== null) {
          needTakes.push(prev[cur])
          cur = prev[cur]
        }
        ret.push([tnk, pathCosts[tnk], needTakes])
      })
      //if (start == 1046) console.log(`dijkstraNearestTowns from ${start} ret:`, ret)
      //console.log('dijkstraNearestTowns took', Date.now()-ts, 'ms')
      //console.log('dijkstraNearestTowns', ret)
      return ret
    },

    // useless, can compute statically and load as json
    /*minimalSpanningForest() {
      const forest = {}
      if (!this.ready)
        return forest
      const ts = Date.now()

      const start = 1  // Velia
      const explored = new Set([])

      const prev = {[start]: null}
      const pathCosts = {[start]: this.nodes[start].CP}
      const unexplored = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unexplored.push(start)
      
      var current
      while (unexplored.size()) {
        current = unexplored.pop()
        if (explored.has(current)) continue
        explored.add(current)
        const cameFrom = prev[current]
        
        if (cameFrom) {
          if (!(cameFrom in forest)) forest[cameFrom] = []
          forest[cameFrom].push(current)
        }

        this.links[current].forEach(neighbor => {
          if (this.nodes[neighbor] == undefined)
            console.log('minimalSpanningForest: no exploration node', neighbor)

          if (!explored.has(neighbor)) {
            prev[neighbor] = current
            pathCosts[neighbor] = this.nodes[neighbor].CP
            unexplored.push(neighbor)  // note order, must have access
          }
        })
      }
      console.log('minimalSpanningForest took', Date.now()-ts, 'ms')
      //if (start == 1216)
        //console.log('dijkstraPath 1216', takens.has(324), needTakes[finish])
      return forest
    },*/

    pzSelectionEntry(pzk, lodgingTk, tnk, mapCp, path, worker, statsOnPz, storageTk) {
      const userStore = useUserStore()
      const profitData = this.profitPzTownStats(pzk, tnk, statsOnPz.wspd, statsOnPz.mspd, statsOnPz.luck, this.isGiant(worker.charkey))
      const addInfraInfo = userStore.townInfraAddCost(lodgingTk, 1, this.plantzones[pzk].itemkeys, storageTk)
      const jobEntry = {
        pz: this.plantzones[pzk],
        tnk,
        mapCp, 
        path,
        townCp: addInfraInfo.cost,
        infraTooltip: addInfraInfo.tooltip,
        cp: mapCp + addInfraInfo.cost,
        profit: profitData,
        w: worker,
        statsOnPz,
        storageTnk: this.tk2tnk(addInfraInfo.storageTk),
      }

      jobEntry.dailyPerCp = jobEntry.profit.priceDaily / (mapCp + addInfraInfo.cost)
      jobEntry.effDelta = userStore.jobEfficiencyDelta(jobEntry.profit.priceDaily, mapCp + addInfraInfo.cost)
      return jobEntry
    },

    workshopSelectionEntry(hk, storageTk, tnk, path, worker, mapCp, houseCp) {
      const userStore = useUserStore()
      const workshop = userStore.userWorkshops[hk]
      const profit = this.profitWorkshopWorker(hk, workshop, worker)
      const addInfraInfo = userStore.townInfraAddCost(storageTk, 1, [])  // TODO: store something
      const totalCp = mapCp + houseCp + addInfraInfo.cost
      const jobEntry = {
        hk,
        tnk,
        mapCp,
        houseCp,
        path,
        townCp: addInfraInfo.cost,
        infraTooltip: addInfraInfo.tooltip,
        cp: totalCp,
        profit, // {statsOnWs,distance,cyclesDaily,priceDaily}
        w: worker,
        workshop
      }
      
      jobEntry.dailyPerCp = jobEntry.profit.priceDaily / totalCp
      jobEntry.effDelta = userStore.jobEfficiencyDelta(jobEntry.profit.priceDaily, totalCp)
      return jobEntry
    },

    addBedInfo(tk) {
      const userStore = useUserStore()
      const addInfraInfo = userStore.townInfraAddCost(tk, 1, [])
      return addInfraInfo
    },

    farmSelectionEntry(tk) {
      const userStore = useUserStore()
      const addInfraInfo = this.addBedInfo(tk)
      const income = userStore.farmingProfitPerWorker
      const entry = {
        income,
        infraCp: addInfraInfo.cost,
        infraTooltip: addInfraInfo.tooltip,
        dailyPerCp: income / addInfraInfo.cost,
        effDelta: userStore.jobEfficiencyDelta(income, addInfraInfo.cost),
      }
      return entry
    },
    
    // return one plantzone specific town profit
    // used by nearestByCP, by WorkerEditor, ...
    profitPzTownStats(pzk, tnk, wspd, mspd, luck, is_giant) {
      if (!(pzk in this.plantzones))
        return {cycleValue:0, cycleMinutes:NaN, cyclesDaily:NaN, priceDaily:0}
      const userStore = useUserStore()
      const marketStore = useMarketStore()
      const pzd = this.plantzones[pzk]
      let ret = {
        dist: this.pzDistance(tnk, pzk),
        cycleValue: marketStore.priceLerp(
          is_giant ? pzd.luckyValue_gi: pzd.luckyValue,
          is_giant ? pzd.unluckyValue_gi : pzd.unluckyValue, 
          luck
        ),
      }
      ret.cyclesDaily = userStore.calcCyclesDaily(pzd.workload, pzd.regiongroup, wspd, ret.dist, mspd)
      
      //if (pzk == '1893') console.log(`profitPzTownStats at pzk=${pzk}`, pzd.workload, pzd.regiongroup, wspd, ret.dist, mspd, 'cyclesDaily', ret.cyclesDaily)

      ret.priceDaily = ret.cyclesDaily * ret.cycleValue / 1000000
      return ret
    },

    profitPzTownArtisans(pzk, tnk, cp) {
      const pzd = this.plantzones[pzk]
      let stat_gob = this.medianGoblin(tnk)
      let profitData = this.profitPzTownStats(pzk, tnk, stat_gob.wspd+5, stat_gob.mspd, stat_gob.luck, false)
      // debugger
      if (profitData.dist > 1E6) {
        return {connected: false}
      }
      profitData.charkey = stat_gob.charkey
      profitData.wspd = stat_gob.wspd
      const workData_gob = {
        ...pzd,
        tnk,
        ...profitData,
        cp,
        dailyPerCp: profitData.priceDaily / cp,
        isGiant: false,
        kind: 'goblin',
      }

      const stat_gi = this.medianGiant(tnk)
      profitData = this.profitPzTownStats(pzk, tnk, stat_gi.wspd+5, stat_gi.mspd, stat_gi.luck, true)
      profitData.charkey = stat_gi.charkey
      profitData.wspd = stat_gi.wspd
      const workData_gi = {
        ...pzd,
        tnk,
        ...profitData,
        cp,
        dailyPerCp: profitData.priceDaily / cp,
        isGiant: true,
        kind: 'giant',
      }
      const workData_best = (workData_gi && workData_gi.dailyPerCp > workData_gob.dailyPerCp) ? workData_gi : workData_gob

      const stat_hum = this.medianHuman(tnk)
      profitData = this.profitPzTownStats(pzk, tnk, stat_hum.wspd+5, stat_hum.mspd, stat_hum.luck, false)
      profitData.charkey = stat_hum.charkey
      profitData.wspd = stat_hum.wspd
      const workData_hum = {
        ...pzd,
        tnk,
        ...profitData,
        cp,
        dailyPerCp: profitData.priceDaily / cp,
        isGiant: true,
        kind: 'human',
      }

      const workData_best2 = (workData_hum && workData_hum.dailyPerCp > workData_best.dailyPerCp) ? workData_hum : workData_best

      const alt_workers_profits = {
        [workData_gi.charkey]:  workData_gi.priceDaily,
        [workData_hum.charkey]: workData_hum.priceDaily,
        [workData_gob.charkey]: workData_gob.priceDaily,
      }
      const alt_workers = Object.entries(alt_workers_profits).map(([charkey, priceDaily]) => ({ charkey, priceDaily }))
      alt_workers.sort((a, b) => a && b && b.priceDaily - a.priceDaily)
      workData_best2.alt_workers_profits = alt_workers_profits
      workData_best2.alt_workers = alt_workers
      workData_best2.connected = true
      workData_best2.cycleValue_gob = workData_gob.cycleValue
      workData_best2.cycleValue_gi = workData_gi.cycleValue
      
      return workData_best2
    },

    makeMedianChar(charkey) {
      const ret = { level: 40 }
      const stat = this.workerStatic[charkey]
      let pa_wspd = stat.wspd
      let pa_mspdBonus = 0
      let pa_luck = stat.luck
      for (let i = 2; i <= 40; i++) {
        pa_wspd += (stat.wspd_lo + stat.wspd_hi) / 2
        pa_mspdBonus += (stat.mspd_lo + stat.mspd_hi) / 2
        pa_luck += (stat.luck_lo + stat.luck_hi) / 2
      }

      let pa_mspd = stat.mspd * (1 + pa_mspdBonus / 1E6)

      ret.wspd = Math.round(pa_wspd / 1E6 * 100) / 100
      ret.mspd = Math.round(pa_mspd) / 100
      ret.luck = Math.round(pa_luck / 1E4 * 100) / 100
      ret.charkey = charkey
      ret.isGiant = this.isGiant(charkey)
      return ret
    },

    medianGoblin(tnk) {
      if (tnk==1623) return this.makeMedianChar(8003) // grana
      if (tnk==1604) return this.makeMedianChar(8003) // owt
      if (tnk==1691) return this.makeMedianChar(8023) // oddy
      if (tnk==1750) return this.makeMedianChar(8035) // eilton
      if (tnk==1781) return this.makeMedianChar(8050) // lotml
      if (tnk==1785) return this.makeMedianChar(8050) // lotml
      if (tnk==1795) return this.makeMedianChar(8050) // lotml
      if (tnk==1857) return this.makeMedianChar(8050) // lotml2
      if (tnk==1858) return this.makeMedianChar(8050) // lotml2
      if (tnk==1853) return this.makeMedianChar(8050) // lotml2
      return this.makeMedianChar(7572)
    },

    medianGiant(tnk) {
      if (tnk==1623) return this.makeMedianChar(8006) // grana
      if (tnk==1604) return this.makeMedianChar(8006) // owt
      if (tnk==1691) return this.makeMedianChar(8027) // oddy
      if (tnk==1750) return this.makeMedianChar(8039) // eilton
      if (tnk==1781) return this.makeMedianChar(8058) // lotml
      if (tnk==1785) return this.makeMedianChar(8058) // lotml
      if (tnk==1795) return this.makeMedianChar(8058) // lotml
      if (tnk==1857) return this.makeMedianChar(8058) // lotml2
      if (tnk==1858) return this.makeMedianChar(8058) // lotml2
      if (tnk==1853) return this.makeMedianChar(8058) // lotml2
      return this.makeMedianChar(7571)
    },

    medianHuman(tnk) {
      if (tnk==1623) return this.makeMedianChar(8009) // grana
      if (tnk==1604) return this.makeMedianChar(8009) // owt
      if (tnk==1691) return this.makeMedianChar(8031) // oddy
      if (tnk==1750) return this.makeMedianChar(8043) // eilton
      if (tnk==1781) return this.makeMedianChar(8054) // lotml
      if (tnk==1785) return this.makeMedianChar(8054) // lotml
      if (tnk==1795) return this.makeMedianChar(8054) // lotml
      if (tnk==1857) return this.makeMedianChar(8054) // lotml2
      if (tnk==1858) return this.makeMedianChar(8054) // lotml2
      if (tnk==1853) return this.makeMedianChar(8054) // lotml2
      return this.makeMedianChar(7573)
    },

    measureWorkshopWorker(hk, workshop, worker) {
      const userStore = useUserStore()
      const statsOnWs = this.workerStatsOnIndustry(worker, workshop.industry)
      //console.log('measureWorkshopWorker', hk, stats)
      const distance = this.houseDistance(worker.tnk, hk)
      const moveMinutes = userStore.calcWalkMinutes(distance, statsOnWs.mspd)

      const autoWorkload = worker.job.recipe ? this.craftInfo[worker.job.recipe].wl : NaN
      const workload = workshop.manualWorkload ? workshop.manualWorkload : autoWorkload
      const workMinutes = Math.ceil(workload / statsOnWs.wspd)
      const cycleMinutes = 5 * workMinutes + moveMinutes
      const cyclesDaily = 24 * 60 / cycleMinutes  // TODO: afk time
      return {statsOnWs, distance, cyclesDaily}
    },

    repeatsWorkshopWorker(w, industry) {
      let ret = 1
      if (!this.ready) return ret
      w.skills.forEach(sk => {
        const skillBonuses = this.skillData[sk]
        if (skillBonuses === undefined)
          return
        if (industry in skillBonuses) ret += skillBonuses[industry]
      })
      //console.log('repeatsWorkshopWorker', w.label, industry, ret)
      return ret
    },

    profitWorkshopWorker(hk, workshop, worker) {
      //dist: this.pzDistance(tnk, pzk),
      //cycleValue: marketStore.priceLerp(
      //cyclesDaily = userStore.calcCyclesDaily(pzd.workload, pzd.regiongroup, wspd, ret.dist, mspd)
      //priceDaily = ret.cyclesDaily * ret.cycleValue / 1000000

      const {statsOnWs, distance, cyclesDaily} = this.measureWorkshopWorker(hk, workshop, worker)
      const repeats = this.repeatsWorkshopWorker(worker, workshop.industry)
      //console.log('profitWorkshopWorker', workshop.manualWorkload, stats.wspd, workMinutes, stats.mspd, moveMinutes, cycleMinutes)
      const priceDaily = repeats * cyclesDaily * workshop.manualCycleIncome / 1000000
      return {
        statsOnWs,
        distance,
        cyclesDaily,
        priceDaily
      }
    },

    //isTown(nk) {
    //  const townKinds = [1, 2]
    //  return townKinds.some(x => x == this.nodes[nk].kind)
    //},
    isLodgingTown(nk) {
      if (typeof(nk) === "string") nk = Number(nk)
      const tnk = this.tnk2tk(nk)
      return tnk in this.lodgingPerTown
    },
    isPlantzone(nk) {
      return nk in this.plantzoneDrops
    },
    isConnectionNode(nk) {
      return !(this.isLodgingTown(nk)) && !(this.isPlantzone(nk))
    },
    itemName(ik) {
      if (!this.ready) return ik
      const userStore = useUserStore()
      if (ik in this.loc[userStore.selectedLang].item)
        return this.loc[userStore.selectedLang].item[ik]
      return ik
    },
    nodeName(nk) {
      if (!this.ready) return nk
      const userStore = useUserStore()
      return this.loc[userStore.selectedLang].node[nk]
    },
    parentNodeName(pzk) {
      if (this.ready && pzk in this.plantzoneStatic) {
        const parentKey = this.plantzoneStatic[pzk].parent
        return this.nodeName(parentKey)
      }
      else
        return pzk
    },
    plantzoneName(pzk) {
      if (this.ready && pzk in this.plantzoneStatic) {
        const nodeKey = this.plantzoneStatic[pzk].node.key
        return this.parentNodeName(pzk) + ' ' + this.nodeName(nodeKey)
      }
      else
        return ""
    },
    pzDistance(tnk, pzk) {
      if (pzk in this.pzk2tk) {
        const tkDistancesList = this.pzk2tk[pzk]
        const tk = this._tnk2tk[tnk]
        for (let i = 0; i < tkDistancesList.length; i++)
          if (tkDistancesList[i][0] == tk)
            return tkDistancesList[i][1]
      }
      else {
        throw new Error(`no distances for pzk ${pzk}`)
      }
      return NaN
    },
    houseDistance(tnk, hk) {
      if (!this.ready) return 0
      //const hnk = this.hk2nk[hk]
      const tk = this._tnk2tk[tnk]
      return this.tk2hk[tk][hk]
    },
    isWorkable(nk) {
      const workables = [4, 6, 7, 8, 9, 14, 15]
      return workables.some(x => x == this.nodes[nk].kind)
    },

    jobIsIdle(job) {
      return job === null
    },
    jobIsPz(job) {
      return (job && typeof(job) == 'object' && 'kind' in job && job.kind == 'plantzone') || typeof(job) == 'number'
    },
    jobIsFarming(job) {
      return job == 'farming'
    },
    jobIsCustom(job) {
      return job?.kind == 'custom'
    },
    jobIsWorkshop(job) {
      return job && typeof(job) == 'object' && 'kind' in job && job.kind == 'workshop'
    },
    jobIcon(job) {
      if (this.jobIsFarming(job)) return '🌻'
      if (this.jobIsCustom(job)) return '✍️'
      if (this.jobIsWorkshop(job)) return '🏭'
      return ''
    },


    lsLookup(tk, wantLodging, wantStorage) {
      if (!this.ready)
        return null
      //const start = performance.now()
      //console.log('lsLookup input', this.ls_lookup)
      const towndata = this.ls_lookup[tk]
      //console.log('lsLookup towndata', towndata)
      //const result = towndata.find(e => e.lodging >= this.wantLodging && e.storage >= this.wantStorage)
      let result = { 
        wantLodging, 
        wantStorage, 
        storage: NaN, 
        cost: NaN,
        lodging: NaN,
        success: false, 
      }
      for (let lodging_string in towndata) {
        const lodging = Number(lodging_string)
        if (lodging >= wantLodging) {
          const entries = towndata[lodging]
          const found = binarySearch(entries, (v) => v.storage >= wantStorage)
          if (found) {
            if (!result.success) {
              result = {wantLodging, wantStorage, ...found, lodging, success: true}
              continue
            }
            if (result.success && found.cost < result.cost) {
              result = {wantLodging, wantStorage, ...found, lodging, success: true}
              break
            }
          }
        }
      }
      const warnL = wantLodging == this.townUpperLimits[tk].lodging
      const errL = wantLodging > this.townUpperLimits[tk].lodging
      const warnS = wantStorage == this.townUpperLimits[tk].storage
      const errS = wantStorage > this.townUpperLimits[tk].storage
      result = {...result, warnL, errL, warnS, errS }
      //console.log('lsLookup', tk, wantLodging, wantStorage, this.townUpperLimits[tk].storage, result)
      //console.log('bestLookup', result, 'took', (performance.now()-start).toFixed(1), 'ms')
      return result
    },

    routeOld(autotakenGrindNodes, routees) {
      const ret = {
        routeInfos: {},
        totalCost: 0,
        //nodeContainsRoute: {},
      }
      const startTime = performance.now()

      const localTaken = new Set([...autotakenGrindNodes])
      routees.forEach(routee => {
        const [usedPath, usedPathCost] = this.dijkstraPath(routee.target, routee.source, localTaken)

        if (!usedPath) return

        usedPath.forEach(nk => localTaken.add(nk))
        const routeInfo = { usedPath, usedPathCost }

        if (!(routee.source in ret.routeInfos)) ret.routeInfos[routee.source] = {}
        ret.routeInfos[routee.source][routee.target] = routeInfo

      })

      //console.log('localTaken', localTaken)
      for (const nk of localTaken) {
        ret.totalCost += this.nodes[nk].CP
      }
      const took = performance.now() - startTime
      console.log('routeOld took', took.toFixed(2), 'ms')

      return ret
    },

    routeWasm(grindTakenList, routees) {
      const ret = {
        routeInfos: {},
        totalCost: 0,
      }
      
      const terminalPairs = []
      for (const r of routees) terminalPairs.push([r.target, r.source])
      for (const n of grindTakenList) terminalPairs.push([n, 99999])
      if (terminalPairs.length == 0) return ret
      //console.log('wasm input', terminalPairs)

      const startTime = performance.now()
      const activatedNodes = this.wasmRouter.solveForTerminalPairs(terminalPairs)
      const took = performance.now() - startTime
      //console.log('wasm', terminalPairs, 'took', took.toFixed(2), 'ms', activatedNodes)
      console.log('routeWasm took', took.toFixed(2), 'ms')
      
      routees.forEach(r => {
        const [usedPath, usedPathCost] = this.miniDijkstra(activatedNodes, r.target, r.source)
        const routeInfo = { usedPath, usedPathCost }
        if (!(r.source in ret.routeInfos)) ret.routeInfos[r.source] = {}
        ret.routeInfos[r.source][r.target] = routeInfo
      })

      for (const nk of activatedNodes) {
        ret.totalCost += this.nodes[nk].CP
      }

      return ret
    },

    miniDijkstra(filteredNodes, start, finish) {
      const ts = Date.now()
      //console.log('miniDijkstra', filteredNodes, start, finish)
      const filteredSet = new Set(filteredNodes)

      const prev = {[start]: null}
      const pathCosts = {[start]: this.nodes[start].CP}
      const unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b])  // note order, must have access
      unvisited.push(start)
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        //console.log('miniDijkstra current', current, this.links[current])
        if (current == finish) break
        if (finish == 99999 && this.wasmBaseTowns.has(current)) break
        
        this.links[current].forEach(neighbor => {
          //console.log('miniDijkstra neighbor', neighbor)
          if (filteredSet.has(neighbor)) {
            const nbrCost = this.nodes[neighbor].CP
            const newDistance = pathCosts[current] + nbrCost
            if (neighbor in pathCosts) {
              // already met before, already in heap
              if (newDistance < pathCosts[neighbor]) {
                pathCosts[neighbor] = newDistance
                prev[neighbor] = current
              }
            }
            else {
              pathCosts[neighbor] = newDistance
              prev[neighbor] = current
              unvisited.push(neighbor)  // note order, must have access
            }
          }
        })
      }
      //console.log('miniDijkstra done', prev)
      const needTakes = [current]
      let cur = current
      while (prev[cur] !== null) {
        //console.log('miniDijkstra reversing, cur', cur, 'prev', prev[cur])
        needTakes.push(prev[cur])
        cur = prev[cur]
        //if (!cur) throw Error('???')
      }
      //console.log('miniDijkstra took', Date.now()-ts, needTakes.reverse())
      return [needTakes.reverse(), pathCosts[finish]]
    },

  },

  getters: {
    uloc() {
      const userStore = useUserStore()
      if (this.ready)
        return this.loc[userStore.selectedLang]
      return {
        town: {},  // 5 (tk) = velia
        housetype: {}, 
        char: {}, 
        item: {}, 
        node: {},  // 1 (tnk) = velia
        skill: {}, 
        skilldesc: {},
        recipe: {},  // 9212 = paprika crate
      }
    },
    townsWithLodgingSet() {
      return new Set(this.townsWithLodging)
    },
    townsWithRentableStorageSet() {
      return new Set(this.townsWithRentableStorage)
    },
    townsWithRedirectableStorageSet() {
      return new Set(this.townsWithRedirectableStorage)
    },
    nearestTown: (state) => (pzk) => {
      const list = state.pzk2tk[pzk]
      if (list && list[0])
        return { tk: list[0][0], dist: list[0][1] }
      return { tk: 0, dist: NaN }
    },
    
    skillKeys() {
      return Object.keys(this.skillData).map(Number)
    },

    housesPerTown() {
      const ret = {}
      this.townsWithRedirectableStorage.forEach(tnk => ret[this.tnk2tk(tnk)] = [])
      for (const [hk, house] of Object.entries(this.houseInfo)) {
        const tk = house.affTown
        if (!(tk in ret))
          ret[tk] = []
        ret[tk].push(Number(hk))
      }
      //console.log('housesPerTown', ret)
      return ret
    },
    
    townUpperLimits() {
      const ret = {}

      for (const [tk, houses] of Object.entries(this.housesPerTown)) {
        const townLimits = {cp: 0, storage: 0, lodging: 0}
        //console.log('tk', tk)
        for (const hk of houses) {
          townLimits.cp += this.houseCost(hk)
          townLimits.storage += this.houseStorage(hk)
          townLimits.lodging += this.houseLodging(hk)
        }
        ret[tk] = townLimits
      }
      //console.log('townUpperLimits', ret)
      return ret
    },

    plantzones() {
      if (!this.ready) return {}
      const start = Date.now()
      const marketStore = useMarketStore()
      const userStore = useUserStore()
      let combined = {}

      for (const [pzk, drop] of Object.entries(this.plantzoneDrops)) {
        const pzd = { ...drop, ...this.plantzoneStatic[pzk] }

        pzd.name = this.plantzoneName(pzk)
        const luckyPart = marketStore.priceBunch(pzd.lucky).val
        //debugger
        pzd.unluckyValue = marketStore.priceBunch(pzd.unlucky).val
        pzd.luckyValue = pzd.unluckyValue + luckyPart

        pzd.unluckyValue_gi = marketStore.priceBunch(pzd.unlucky_gi).val
        pzd.luckyValue_gi = pzd.unluckyValue_gi + luckyPart
        
        pzd.activeWorkload = pzd.workload * (2 - userStore.productivity(pzd.regiongroup))
        pzd.itemkeys = new Set([...Object.keys(pzd.unlucky), ...Object.keys(pzd.lucky)])

        combined[pzk] = pzd
      }

      console.log('plantzones getter took', Date.now()-start, 'ms')
      return combined
    },

    itemkeyPlantzones() {
      const ret = {}
      if (!this.ready) return ret

      for (const [pzk, pzd] of Object.entries(this.plantzones)) {
        pzd.itemkeys.forEach(ik => {
          if (!(ik in ret)) ret[ik] = new Set([])
          ret[ik].add(Number(pzk))
        })
      }
      //console.log('itemkeyPlantzones', ret)
      return ret
    },

  },
});
