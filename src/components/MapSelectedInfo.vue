<script>
import {useUserStore} from '../stores/user'
import {useRoutingStore} from '../stores/routing'
import {useGameStore} from '../stores/game.js'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import {formatFixed} from '../util.js'
import Worker from '../components/Worker.vue'
import TownWorkers from './TownWorkers.vue'
import TownWorkshops from './TownWorkshops.vue'
import Plantzone from '../components/Plantzone.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const routingStore = useRoutingStore()
    const gameStore = useGameStore()
    const marketStore = useMarketStore()
    const mapStore = useMapStore()

    mapStore.$subscribe((mutation, state) => {
      localStorage.setItem('map', JSON.stringify(state))
    })

    userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })

    return { marketStore, userStore, routingStore, gameStore, mapStore }
  },
  components: {
    Worker,
    TownWorkers,
    TownWorkshops,
    Plantzone,
  },
  props: {
    clickedNode: Object,
  },
  emits: [
    'selectLodging',
    'selectHouses',
    'hireWorker',
    'editWorker',
    'sendWorker',
    'panToPaPos',
    'showResourceDialog',
    'setClickedNode',
    'selectWorker',
  ],
  data: () => ({
    
  }),
  methods: {
    formatFixed,
    jobCashFlowPercent(job) {
      return job.profit.priceDaily / this.routingStore.currentNodesCashflow[this.clickedNode.key]
    },

    selectLodging(tk) {
      this.$emit('selectLodging', tk)
    },
    selectHouses(tk) {
      this.$emit('selectHouses', tk)
    },
    hireWorker(tk) {
      this.$emit('hireWorker', tk)
    },
    editWorker(w) {
      this.$emit('editWorker', w)
    },
    sendWorker(w) {
      this.$emit('sendWorker', w)
    },
    panToPaPos(e) {
      this.$emit('panToPaPos', e)
    },
    showResourceDialog(pzk) {
      this.$emit('showResourceDialog', pzk)
    },
    setClickedNode(n) {
      this.$emit('setClickedNode', n)
    },
    selectWorker(hk) {
      //console.log('selectWorker')
      this.$emit('selectWorker', hk)
    },
  },

  computed: {

    activeNodeJobs_sorted() {
      const ret = this.routingStore.nodesUsedBy[this.clickedNode.key]  // list of jobs (pz/ws)
      ret.sort((a,b) => this.jobCashFlowPercent(b) - this.jobCashFlowPercent(a))
      return ret
    },
    
  },

}
</script>

<template>
  <div id="mapObjDetail" v-if="clickedNode">
    <!-- && (gameStore.tnk2tk(clickedNode.key) in gameStore.lodgingPerTown || clickedNode.key in gameStore.plantzoneDrops) -->          
    <div class="rolldown" @click="setClickedNode(null)">
      <div>˅</div>
    </div>

    <div id="clickedTownInfo" v-if="gameStore.isLodgingTown(clickedNode.key)" class="vscrollable">

      <div class="vscroll40">
        <table class="stickyhead">
          <TownWorkers
            :o="gameStore.lodgingPerTown[gameStore.tnk2tk(clickedNode.key)]"
            :tk="gameStore.tnk2tk(clickedNode.key)"
            @selectLodging="selectLodging"
            @selectHouses="selectHouses"
            @hireWorker="hireWorker"
            @editWorker="editWorker"
            @sendWorker="sendWorker"
            @panToPaPos="panToPaPos"
          />

        </table>
      </div>
      
      <TownWorkshops v-if="userStore.userWorkshops"
        :tk="gameStore.tnk2tk(clickedNode.key)"
        @selectWorker="selectWorker"
        @editWorker="editWorker"
      />
      
    </div>
    <div id="clickedTownInfo" v-else-if="gameStore.townsWithRentableStorageSet.has(clickedNode.key)" class="vscrollable">
      <button @click="this.$emit('selectHouses', gameStore.tnk2tk(clickedNode.key))" :class="{ 'unresolved': gameStore.ready && userStore.townsInfra[gameStore.tnk2tk(clickedNode.key)].success == false }">
        config
      </button>
    </div>

    <div id="clickedNodeName" v-if="gameStore.isConnectionNode(clickedNode.key)">
      <p>
        {{ gameStore.uloc.node[clickedNode.key] }}
        <template v-if="routingStore.routing.autotakenGrindNodes.has(clickedNode.key)">
          <s>{{ clickedNode.thisCpCost }}CP</s> <abbr class="tooltip" title="used for grind node">ℹ</abbr>
        </template>
        <template v-else>
          {{ clickedNode.thisCpCost }}CP
        </template>
      </p>

      <p class="fsxs" v-if="clickedNode.key in routingStore.nodesUsedBy && activeNodeJobs_sorted && activeNodeJobs_sorted.length > 0">
        used by:
        <table id="link_sharing">
          <thead>
            <tr>
              <th>share</th>
              <th>description</th>
              <th>M$/day</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="mapJob in activeNodeJobs_sorted">
              <th>{{ formatFixed(jobCashFlowPercent(mapJob) * 100) }}%</th>
              <th>
                <span 
                  v-if="mapJob.pzk"
                  @click="$emit('panToPaPos', this.gameStore.nodes[mapJob.pzk].pos)" 
                  class="clickable"
                >
                  plantzone {{ gameStore.plantzoneName(mapJob.pzk) }} 
                </span>
                <span v-else-if="mapJob.hk">
                  workshop {{ gameStore.uloc.char[mapJob.hk] }}
                  {{ userStore.userWorkshops[mapJob.hk].label }}
                </span>
                <span 
                  v-else-if="mapJob.nk"
                  @click="$emit('panToPaPos', this.gameStore.nodes[mapJob.nk].pos)" 
                  class="clickable"
                >
                  grinding {{ gameStore.uloc.node[mapJob.nk] }}
                </span>
                <template v-else-if="mapJob.nk_orig && mapJob.nk_dest">
                  wagon 
                  <span 
                    @click="$emit('panToPaPos', this.gameStore.nodes[mapJob.nk_orig].pos)" 
                    class="clickable"
                  >
                    {{ gameStore.uloc.node[mapJob.nk_orig] }}
                  </span>
                   → 
                  <span 
                    @click="$emit('panToPaPos', this.gameStore.nodes[mapJob.nk_dest].pos)" 
                    class="clickable"
                  >
                    {{ gameStore.uloc.node[mapJob.nk_dest] }}
                  </span>
                </template>
              </th>
              <th>{{ formatFixed(mapJob.profit.priceDaily, 2) }}</th>
            </tr>
          </tbody>
        </table>
      </p>

      <input type="checkbox" @change="userStore.modifyGrindTakens($event, clickedNode.key)" :checked="userStore.grindTakenSet.has(clickedNode.key)">
      grind node (invested for droprate)
      <div v-if="userStore.grindTakenSet.has(clickedNode.key)">
        brings <input type="number" class="price tar" v-model.number="userStore.grindTakenValues[clickedNode.key]">
        M$/day
      </div>
    </div>

    <div id="clickedPlantzoneInfo" v-if="gameStore.isPlantzone(clickedNode.key)">
      <template v-if="userStore.grindTakenSet.has(clickedNode.key)">
        <input type="checkbox" @change="userStore.modifyGrindTakens($event, clickedNode.key)" :checked="userStore.grindTakenSet.has(clickedNode.key)">
        grind node (invested for droprate)
      </template>
      
      <Plantzone
        :pzk="clickedNode.key"
        @showResourceDialog="showResourceDialog"
        @editWorker="editWorker"
      />
    </div>
  
  </div>
</template>

<style scoped>

.rolldown {
  cursor: pointer;
  text-align: center;
  height: 0.8em;
  margin-bottom: 0px;
}
.rolldown div {
  top: -0.4em;
}
.rolldown:hover {
  background-color: var(--color-background-soft);
}
.tooltip {
  cursor: help;
}
button.unresolved {
  border-color: rgba(255, 0, 0, 0.7);
}
.vscroll40 {
    max-height: 40vh;  /* percents of viewport height */
    overflow-y: auto;   /* Show scrollbar only when needed */
}
</style>
