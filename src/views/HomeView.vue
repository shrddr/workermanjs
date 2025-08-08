<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import Worker from '../components/Worker.vue'
import TownWorkers from '../components/TownWorkers.vue'
import Plantzone from '../components/Plantzone.vue'
import {formatFixed, randBetween, levelup} from '../util.js'
import ModalDialog from '../components/ModalDialog.vue'
import WorkerEdit from '../components/WorkerEdit.vue'
import WorkerSendSelection from '../components/WorkerSendSelection.vue'
import LodgingSelection from '../components/LodgingSelection.vue'
import HousesSelection from '../components/HousesSelection.vue'
import NodeMap from "../components/NodeMap.vue";
import MapSelectedInfo from "../components/MapSelectedInfo.vue";
import EmpireOverview from '../components/EmpireOverview.vue'
import FloatingResourceEdit from '../components/FloatingResourceEdit.vue'
import WorkerSelection from '../components/WorkerSelection.vue'
import SearchBar from '../components/SearchBar.vue'
import ItemIcon from '../components/lo/ItemIcon.vue'
import { ref, nextTick } from "vue";


export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()
    const marketStore = useMarketStore()
    const mapStore = useMapStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore, marketStore, mapStore }
  },
  
  components: {
    ItemIcon,
    Worker,
    TownWorkers,
    Plantzone,
    ModalDialog,
    WorkerEdit,
    WorkerSendSelection,
    LodgingSelection,
    HousesSelection,
    NodeMap,
    MapSelectedInfo,
    EmpireOverview,
    FloatingResourceEdit,
    WorkerSelection,
    SearchBar,
  },

  data: () => ({
    workerEditing: null,
    workerEditingInitial: null,
    workerEditingInitialProfit: 0,
    workerDialogVisible: false,
    sendDialogWorker: null,
    sendDialogVisible: false,
    lodgingDialogTown: "0",
    lodgingDialogData: null,
    lodgingDialogVisible: false,
    housesDialogTown: 0,
    housesDialogVisible: false,
    importDialogVisible: false,
    clickedNode: null,
    hoverInfo: null,
    resourceDialogWspd: 150,
    resourceDialogRgroup: 1,
    resourceDialogWkld: 400,
    resourceDialogVisible: false,
    panToPzk: null,
    panPaPos: null,
    selectWorkerDialogVisible: false,
    selectWorkerHouseKey: 0,

    importData: null,
    importSkipSections: {},

    prerelease_zerocost: true,
    prerelease_colorGoblins: false,
    showSearchBar: false,
    highlightNodes: new Set([]),
  }),

  created() {
    console.log('addEventListener')
    window.addEventListener("keydown", this.onKeydown);
  },

  watch: {
  },

  computed: {
    
  },

  mounted() {
    
  },
  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeydown);
  },

  methods: {
    formatFixed,
    randBetween,
    levelup,

    onKeydown(event) {
      if (event.ctrlKey && event.code === "KeyF") {
        event.preventDefault()
        this.showSearchBar = true
        nextTick(() => this.$refs.searchBar.focusInput())
      }
      if (event.key === "Escape") {
        if (this.showSearchBar) this.showSearchBar = false
        else this.handleSearchSelection(new Set([]))
      }
    },
    handleSearchSelection(pzkList) {
      //console.log("highlight", pzkList)
      this.highlightNodes = pzkList
      
      nextTick(() => {
        this.$refs.nodeMap.updateLayers()
        if (pzkList.size > 0) {
          let x1 = 1e99
          let y1 = 1e99
          let x2 = -1e99
          let y2 = -1e99
          pzkList.forEach(pzk => {
            x1 = Math.min(x1, this.gameStore.nodes[pzk].pos.x)
            y1 = Math.min(y1, this.gameStore.nodes[pzk].pos.z)
            x2 = Math.max(x2, this.gameStore.nodes[pzk].pos.x)
            y2 = Math.max(y2, this.gameStore.nodes[pzk].pos.z)
          })
          this.$refs.nodeMap.panToBbox(x1, x2, y1, y2)
        }
      })
      this.showSearchBar = false
    },

    hireWorker(tk) {
      const w = this.userStore.useDefaultWorker ? {...this.userStore.defaultWorker, tnk: this.gameStore.tk2tnk(tk)} : this.hireRandomArtGob(tk)
      console.log('w', w)
      this.userStore.userWorkers.push(w)
    },

    hireRandomArtGob(tk) {
      const label = this.userStore.newWorkerName(tk)
      const charkey = 7572
      let w = {
        tk,
        tnk: this.gameStore.tk2tnk(tk),
        charkey,
        label,
        level: 1,
        wspdSheet: this.gameStore.workerStatic[charkey].wspd / 1E6,
        mspdSheet: this.gameStore.workerStatic[charkey].mspd / 100,
        luckSheet: this.gameStore.workerStatic[charkey].luck / 1E4,
        skills: [],
        job: null,
      }

      w.skills.push(this.gameStore.randomSkill(w.skills))
      
      levelup(this.gameStore, w, 40)
      w.wspdSheet = Math.round(w.wspdSheet * 100) / 100
      w.mspdSheet = Math.round(w.mspdSheet * 100) / 100
      w.luckSheet = Math.round(w.luckSheet * 100) / 100

      return w
    },
    
    fireWorker(who) {
      this.userStore.userWorkers = this.userStore.userWorkers.filter(w => w != who)
    },

    sendWorker(worker) {
      const stats = this.gameStore.workerStatsOnPlantzone(worker)
      this.sendDialogWorker = worker
      this.sendDialogVisible = true
    },

    unsendWorker(worker) {
      worker.job = null
    },

    editWorker(w) {
      this.workerEditing = w
      this.workerEditingInitial = JSON.parse(JSON.stringify(w))
      this.workerEditingInitialProfit = w && w.job && typeof(w.job) == 'number' ? this.userStore.pzJobs[this.workerEditing.job].profit.priceDaily : 0
      this.workerDialogVisible = true
    },

    hireAll() {
      for (const tk of Object.keys(this.gameStore.lodgingPerTown)) {
        const slotsHere = this.userStore.townFreeLodgingCount(tk)
        for (let i = 0; i < slotsHere; i++) {
          this.hireWorker(tk)
        }
      }
    },

    fireAll() {
      this.userStore.userWorkers = []
    },

    selectLodging(tk) {
      this.lodgingDialogTown = tk
      this.lodgingDialogData = this.gameStore.lodgingPerTown[tk]
      this.lodgingDialogVisible = true
    },

    selectHouses(tk) {
      this.housesDialogTown = tk
      this.housesDialogVisible = true
      console.log('housesDialogVisible')
    },

    selectWorker(hk) {
      this.selectWorkerHouseKey = hk
      this.selectWorkerDialogVisible = true
      console.log('selectWorkerDialogVisible')
    },

    fileImport(event) {
      if (!event) return
      const fileList = event.target[0].files
      if (fileList.length < 1) return
      const file = fileList[0]
      console.log('fileImport', file)
      const reader = new FileReader()
      reader.onload = this.fileParse
      reader.readAsText(file)
    },

    fileParse(event) {
      let str = event.target.result
      let json = JSON.parse(str)
      
      // Remove workers with unknown charkeys
      for (let i = json.userWorkers.length - 1; i >= 0; i--) {
        const charkey = json.userWorkers[i].charkey
        if (!(charkey in this.gameStore.workerStatic)) {
          console.log(`unknown charkey ${charkey} - discarded`)
          json.userWorkers.splice(i, 1)
        }
      }

      // migrate from old formats
      json.userWorkers.forEach(w => {
        // remove unused values
        delete w.tk
        const stat = this.gameStore.workerStatic[w.charkey]
        // convert sheetStats to lvlupStats
        if ('wspdLvlup' in w) {
          const wspdSheet = (stat.wspd + w.wspdLvlup)/1E6
          w.wspdSheet = Math.round(wspdSheet*100)/100
          delete w.wspdLvlup
        }
        if ('mspdLvlup' in w) {
          const mspdSheet = stat.mspd/100 * (1 + w.mspdLvlup/1E6)
          w.mspdSheet = Math.round(mspdSheet*100)/100
          delete w.mspdLvlup
        }
        if ('mspdBase' in w) {
          delete w.mspdBase
        }
        if ('luckLvlup' in w) {
          const luckSheet = (stat.luck + w.luckLvlup)/1E4
          w.luckSheet = Math.round(luckSheet*100)/100
          delete w.luckLvlup
        }
        // create missing workshop entries
        if (this.gameStore.jobIsWorkshop(w.job)) {
          if (!(w.job.hk in this.userStore.userWorkshops)) {
            this.userStore.userWorkshops[w.job.hk] = { ...this.userStore.defaultUserWorkshop }
            console.log(`userWorkshop #${w.job.hk} not set, using default`)
          }
        }
        // update from number format
        if (typeof(w.job) == 'number') {
          const pzk = w.job
          w.job = { kind: 'plantzone', pzk, storage: w.tnk }
        }
        // remove jobs at unknown pzk's
        if (this.gameStore.jobIsPz(w.job) && !(w.job.pzk in this.gameStore.plantzones)) {
          console.log(`removing plantzone job of worker ${w.label}: unknown pzk`, w.job)
          w.job = null
        }
        // update custom job format
        if (Array.isArray(w.job)) {
          w.job = { kind: 'custom', profit: w.job[1], cp: w.job[2], label: w.job[3]}
        }
      })
      
      console.log('import parsed')

      // "this.userStore = json" but better
      this.userStore.$patch(json)

      // handle file entries that are empty 
      if (json.lodgingTaken && Object.keys(json.lodgingTaken).length > 0) {
        console.log('overwriting lodgingTaken')
        this.userStore.lodgingTaken = json.lodgingTaken
      }
      else
        console.log('keeping lodgingTaken')
        
      if (json.lodgingP2W && Object.keys(json.lodgingP2W).length > 0) {
        console.log('overwriting lodgingP2W')
        this.userStore.lodgingP2W = json.lodgingP2W
      }
      else
        console.log('keeping lodgingP2W')
        
      console.log('import done')
      this.importDialogVisible = false
    },

    fileExport() {
      var a = document.createElement("a")
      let out = { 
        activateAncado: this.userStore.activateAncado,
        lodgingP2W: this.userStore.lodgingP2W,
        lodgingTaken: this.userStore.lodgingTaken,
        userWorkers: this.userStore.userWorkers,
        farmingEnable: this.userStore.farmingEnable,
        farmingProfit: this.userStore.farmingProfit,
        farmingBareProfit: this.userStore.farmingBareProfit,
        grindTakenList: this.userStore.grindTakenList,
      } 
      const str = JSON.stringify(out)
      var file = new Blob([str], {type: 'text/plain'});
      a.href = URL.createObjectURL(file);
      a.download = 'user.json';
      a.click();
    },

    log(s) {
      console.log(s)
    },

    showResourceDialog(pzk) {
      this.resourceDialogVisible = true
      this.resourceDialogRgroup = this.gameStore.plantzoneStatic[pzk].regiongroup
      this.resourceDialogWkld = this.gameStore.plantzones[pzk].peg.time
      this.resourceDialogWspd = this.userStore.workedPlantzones.has(String(pzk)) ? this.userStore.pzJobs[pzk].worker.wspdSheet + this.gameStore.wspdBonus(this.userStore.pzJobs[pzk].worker, 'farm') : 150
    },

    panToHash() {
      if (this.$route.hash) {
        this.panToPzk = this.$route.hash.replace("#node", "")
      }
    },

    panToPaPos(pos) {
      this.panPaPos = pos
    },

    setClickedNode(n) {
      this.clickedNode = n
    },

  },

  mounted() {
    this.panToHash()
  },

}
</script>

<template>
  
  <ModalDialog v-model:show="workerDialogVisible">
    <WorkerEdit 
      :workerEditing="workerEditing" 
      :workerInitial="workerEditingInitial" 
      :initialProfit="workerEditingInitialProfit" 
      v-model:show="workerDialogVisible"
    />
  </ModalDialog>
  
  <ModalDialog v-model:show="sendDialogVisible">
    <WorkerSendSelection :w="sendDialogWorker" v-model:show="sendDialogVisible"/>
  </ModalDialog>

  <ModalDialog v-model:show="lodgingDialogVisible">
    <LodgingSelection :tk="lodgingDialogTown" :o="lodgingDialogData" v-model:show="lodgingDialogVisible"/>
  </ModalDialog>

  <ModalDialog v-model:show="housesDialogVisible">
    <HousesSelection :tk="housesDialogTown" v-model:show="housesDialogVisible"/>
  </ModalDialog>

  <ModalDialog v-model:show="selectWorkerDialogVisible">
    <WorkerSelection :hk="selectWorkerHouseKey" v-model:show="selectWorkerDialogVisible"/>
  </ModalDialog>

  <ModalDialog v-model:show="importDialogVisible">
    <form @submit.prevent="fileImport($event)">
      <input type="file" accept=".json" @click="fileImport()" />
      <button>import</button><br/>
    </form>
  </ModalDialog>

  <ModalDialog v-model:show="resourceDialogVisible">
    <FloatingResourceEdit 
      :rgk="resourceDialogRgroup"
      :wspd="resourceDialogWspd"
      :workload="resourceDialogWkld"
      v-model:show="resourceDialogVisible"
    />
    <div style="width: 24em;">Test with workspeed:
      <input 
        type="range" 
        class="vmid"
        v-model.number="resourceDialogWspd" 
        min="40" 
        max="200" 
        step="0.01"
      />
      {{ resourceDialogWspd }}
    </div>
  </ModalDialog>

  <main>

    <div id="canvas-limiter">

      <NodeMap 
        ref="nodeMap"
        v-model:clickedObj="clickedNode" 
        v-model:hoverInfo="hoverInfo" 
        v-model:panToPzk="panToPzk"
        v-model:panPaPos="panPaPos"
        @panAnywhere="panPaPos = null"
        :highlightNodes="highlightNodes"
      />

      <div v-if="hoverInfo && hoverInfo.object" id="tooltip" :style="{left:hoverInfo.x+'px', top:hoverInfo.y+'px'}">
        {{ hoverInfo.object.key }} {{ gameStore.uloc.node[hoverInfo.object.key] }} {{ hoverInfo.object.thisCpCost }}CP
        <span v-if="hoverInfo.object.key in this.gameStore.plantzones">
          <ItemIcon v-for="k in this.gameStore.plantzones[hoverInfo.object.key].itemkeys" :ik="Number(k)"/>
        </span>
        <span v-if="this.gameStore.townsConnectionRoots.has(hoverInfo.object.key)">
          <br/>[town {{ this.gameStore._tnk2tk[hoverInfo.object.key] }}]
        </span>
        <br/>
        <!--{{ hoverInfo.object.fromTownCpCost }}CP → {{this.gameStore.uloc.node[hoverInfo.object.fromTown] }}-->
      </div>

      <div id="topleft">
        <details>
          <summary>Empire</summary>
          <EmpireOverview
            @panToPaPos="panToPaPos"
          />
        </details>

      </div>

      <div id="leftside">
        <MapSelectedInfo 
          :clickedNode="clickedNode"
          @selectLodging="selectLodging"
          @selectHouses="selectHouses"
          @hireWorker="hireWorker"
          @editWorker="editWorker"
          @sendWorker="sendWorker"
          @panToPaPos="panToPaPos"
          @showResourceDialog="showResourceDialog"
          @setClickedNode="setClickedNode"
          @selectWorker="selectWorker"
        />
      </div>

      <div id="rightside">

        <search-bar 
          ref="searchBar"
          :visible="showSearchBar" 
          @close="showSearchBar = false" 
          @select="handleSearchSelection"
        />

        <div id="totals">
          <details>
            <summary>Total workers: {{ userStore.countWorkers }}</summary>
            <p class="fsxs">
              nodes: {{ userStore.workedPlantzones.size }} <br/>

              <template v-if="userStore.workersFarmingCount">
                <template v-if="!userStore.farmingEnable">
                  <abbr title="CP not allocated for fences, enable Farming on Settings page">⚠️</abbr>
                </template>
                <template v-else-if="userStore.workersFarmingCount && userStore.workersFarmingCount < 10">
                  <abbr title="not all fences being worked, for best results either send 10 workers or none at all">⚠️</abbr>
                </template>
                farming:
                {{ userStore.workersFarmingCount }} <br/> 
              </template>

              <template v-if="userStore.workersWorkshopCount">
                workshops: {{ userStore.workersWorkshopCount }} <br/> 
              </template>

              <template v-if="userStore.workersCustomCount">
                custom: {{ userStore.workersCustomCount }} <br/> 
              </template>

              <template v-if="userStore.workersIdleCount">
                ⚠️ idle: {{ userStore.workersIdleCount }} 
              </template>
            </p>
          </details>

          <details>
            <summary>Total CP: {{ formatFixed(userStore.totalCP + userStore.autotakenGrindNodesCP) }}</summary>
            <p class="fsxs">
              <template v-if="userStore.routing.autotakenGrindNodesCP">
                invested for droprate: <abbr class="tooltip" :title="userStore.grindTakenDesc">
                  {{ userStore.routing.autotakenGrindNodesCP }}
                </abbr><br/>
              </template>

              nodes: {{ userStore.autotakenNodesCP }} <br/>
              lodging/storage: {{ userStore.lodgage }} <br/>
                
              <template v-if="userStore.farmingEnable">
                farming: {{ userStore.farmingCP }} <br/>
              </template>

              <template v-if="userStore.workersWorkshopCount">
                workshops:
                {{ formatFixed(userStore.workshopTotalCP) }} <br/>
              </template>

              <template v-if="userStore.workersCustomCount">
                custom:
                {{ userStore.customTotalCP }} <br/>
              </template>

            </p>
            
          </details>

          <details>
            <summary>Total M$/day: {{ formatFixed(userStore.allJobsTotalDailyProfit, 2) }}</summary>
            <p class="fsxs">
              nodes: {{ formatFixed(userStore.pzJobsTotalDailyProfit, 2) }} <br/>
              <template v-if="userStore.workersFarmingCount">
                farming: {{ formatFixed(userStore.farmingTotalProfit, 2) }} <br/>
              </template>
              <template v-if="userStore.workersWorkshopCount">
                workshops: {{ formatFixed(userStore.workshopTotalProfit, 2) }} <br/> 
              </template>
              <template v-if="userStore.workersCustomCount">
                custom: {{ formatFixed(userStore.customTotalProfit, 2) }} <br/> 
              </template>
            </p>
          </details>

          <details>
            <summary>Total efficiency: {{ formatFixed(userStore.allJobsDailyProfitPerCp, 3) }}</summary>
            (M$/day/CP)
            <p class="fsxs">
              nodes: {{ formatFixed(userStore.pzJobsDailyProfitPerCp, 3) }} <br/> 
              <template v-if="userStore.farmingEnable">
                farming: {{ formatFixed(userStore.farmingJobsDailyProfitPerCp, 3) }} <br/> 
              </template>
              <template v-if="userStore.workersWorkshopCount">
                workshops: {{ formatFixed(userStore.workshopJobsDailyProfitPerCp, 3) }} <br/> 
              </template>
              <template v-if="userStore.workersCustomCount">
                custom: {{ formatFixed(userStore.customJobsDailyProfitPerCp, 3) }} <br/> 
              </template>
            </p>
          </details>

          <input type="checkbox" id="wr_cb" v-model="userStore.wasmRouting">
            <label for="wr_cb"> wasm routing</label>
        </div>

        <div style="clear:both;"></div>

        <div id="workerlist">
          <details>
            <summary>All towns/workers list</summary>

            show:
            <label class="switch mauto">
              <input type="checkbox" v-model="userStore.displayWorkerNames">
              <span class="slider"></span>
              names
            </label>
            <label class="switch mauto">
              <input type="checkbox" v-model="userStore.displayWorkerStatsRank" :disabled="userStore.displayWorkerStatsForPz">
              <span class="slider"></span>
              stat ranks
            </label>
            <label class="switch mauto">
              <input type="checkbox" v-model="userStore.displayWorkerStatsForPz" :disabled="userStore.displayWorkerStatsRank">
              <span class="slider"></span>
              stats after skills
            </label>
            <label class="switch mauto">
              <input type="checkbox" v-model="userStore.displayProfitPerCp">
              <span class="slider"></span>
              efficiency
            </label>

            <button @click="importDialogVisible = true">import</button>
            <button @click="fileExport()">export</button>
            <button v-if="0" @click="hireAll()">hire all</button>
            <button @click="fireAll()">fire all</button>
            
            <table>
              <template v-for="(o, tk) in gameStore.lodgingPerTown">
                <TownWorkers
                  :o="o"
                  :tk="Number(tk)"
                  @selectLodging="selectLodging"
                  @selectHouses="selectHouses"
                  @hireWorker="hireWorker"
                  @editWorker="editWorker"
                  @sendWorker="sendWorker"
                  @panToPaPos="panToPaPos"
                />
              </template>

            </table>
          </details>
        </div>
      </div>

      
    </div>

  </main>
</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  height: 96%;
  overflow: hidden;
}
summary {
  cursor: pointer;
}
#mappane {
  /*width: 60%;*/
  flex-grow: 1;
}
#canvas-limiter {
  height: 100%;
  width: 100%;
  /*display: flex;
  justify-content: space-between;*/
}
#tooltip {
  z-index: 1;
  position: absolute;
  pointer-events: none;
  color: rgb(160, 167, 180);
  background-color: rgb(41, 50, 60);
  padding: 10px;
}
#topleft {
  position: absolute;
  top: 0;
  max-height: 40%;
  background-color: var(--color-background);
  padding: 0 5px 5px 0;
  overflow: auto;
}
#leftside {
  position: absolute;
  bottom: 0;
  max-height: 90%;
}

#mapObjDetail {
  overflow: auto;
  background-color: var(--color-background);
  padding: 5px 5px 0 0;
}
#rightside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  float: right;
  max-height: 100%;
}
#totals {
  padding: 5px;
  float: right;
  text-align: right;
  background-color: var(--color-background);
  z-index: 20;
}
#workerlist {
  padding: 0 5px 5px 5px;
  float: right;
  text-align: right;
  background-color: var(--color-background);
  
  overflow-y: auto;
  /*height: 100px;
  flex: 1 1 auto;*/
}
#textpane {
  display: flex;
  flex-direction: column;
  width: 29em;
}
.lim2em {
  display: inline-block;
  width: 2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.w30em {
  width: 30em;
}
.tooltip {
  cursor: help;
}


</style>