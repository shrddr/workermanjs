<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {makeIconSrc, formatFixed} from '../util.js'
import ModalDialog from '../components/ModalDialog.vue'
import WorkerEdit from '../components/WorkerEdit.vue'
import WorkshopsConfig from '../components/WorkshopsConfig.vue'

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()
    const marketStore = useMarketStore()

    userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })

    return { gameStore, userStore, marketStore }
  },
  components: {
    ModalDialog,
    WorkerEdit,
    WorkshopsConfig,
  },
  data: () => ({
    workerDialogVisible: false,
    workshopsConfigVisible: false,
    highlightPending: false,
    importDialogVisible: false,
  }),
  watch: {
    'userStore.marketUrl': {
      handler(newValue, oldValue) {
        this.marketStore.fetchData()
      }
    },
  },
  methods: {
    makeIconSrc,
    formatFixed,

    reload() {
      this.marketStore.ready = false
      this.marketStore.fetchData()
    },

    highlightHash() {
      if (!this.highlightPending)
        return

      console.log('highlighting', this.$route.hash, this.highlightPending)

      if (this.$route.hash) {
        const el = document.querySelector(this.$route.hash)
        if (el) {
          this.highlightPending = false
          el.scrollIntoView()
          el.classList.add("anim")
        }
      }
    },

    fileParse(event) {
      let str = event.target.result
      let json = JSON.parse(str)
      if ('effectivePrices' in json) delete json.effectivePrices;
      this.userStore.$patch(json)
      this.importDialogVisible = false
    },

    fileImport(event) {
      if (!event) return
      const fileList = event.target[0].files
      if (fileList.length < 1) return
      const file = fileList[0]
      console.log('fileImport', file)
      let reader = new FileReader()
      reader.onload = this.fileParse
      reader.readAsText(file)
    },

    fileExport() {
      var a = document.createElement("a")
      let out = { 
        customPrices: this.userStore.customPrices,
        keepItems: this.userStore.keepItems,
        effectivePrices: this.marketStore.prices,
      } 
      const str = JSON.stringify(out)
      var file = new Blob([str], {type: 'text/plain'});
      a.href = URL.createObjectURL(file);
      a.download = 'custom_prices.json';
      a.click();
    },

    clearCustomPrices() {
      this.userStore.customPrices = {}
      this.userStore.keepItems = {}
    },
  },
  
  mounted() {
    this.highlightPending = true
    this.highlightHash()
  },

  updated() {
    this.$nextTick(() => {
      this.highlightHash()
    })
  }
}
</script>

<template>
  <ModalDialog v-model:show="importDialogVisible">
    <form @submit.prevent="fileImport($event)">
      <input type="file" accept=".json" @click="fileImport()" />
      <button>import</button>
    </form>
  </ModalDialog>
  <ModalDialog v-model:show="workerDialogVisible">
    <WorkerEdit 
      :workerEditing="userStore.defaultWorker" 
      :initialProfit="0" 
      v-model:show="workerDialogVisible"
    />
  </ModalDialog>
  <ModalDialog v-model:show="workshopsConfigVisible">
    <WorkshopsConfig/>
  </ModalDialog>
  <main>
    <div id="toptext">
      <div class="settings-tiles">

        <div class="settings-tile">
          
          <div>
            Server: <select v-model="userStore.selectedRegion" @change="fetchMarket">
              <option>NA</option>
              <option>EU</option>
              <option>RU</option>
              <option>KR</option>
              <option>JP</option>
              <option>TH</option>
              <option>TW</option>
              <option>SA</option>
              <option>SEA</option>
              <option>MENA</option>
              <option>CEU</option>
              <option>CNA</option>
            </select>
            
            <br/>
            ⤷ base storage: {{ userStore.baseStorage }}
            (<input type="checkbox" id="vp_t" v-model="userStore.storageVP">
            <label for="vp_t">VP always on</label>) 
          </div>

          <div>
            Tax: <select v-model="userStore.selectedTax">
              <option value="0.65">0.65 (0)</option>
              <option value="0.65325">0.65325 (1000)</option>
              <option value="0.6565">0.6565 (4000)</option>
              <option value="0.65975">0.65975 (7000)</option>
              <option value="0.65975">0.69225 (7000 + ring)</option>
              <option value="0.845">0.845 (0 + VP)</option>
              <option value="0.84825">0.84825 (1000 + VP)</option>
              <option value="0.8515">0.8515 (4000 + VP)</option>
              <option value="0.85475">0.85475 (7000 + VP)</option>
              <option value="0.88725">0.88725 (7000 + ring + VP)</option>
              <option value="1">1 (just hoarding)</option>
            </select>
          </div>

          <div>
            Language: <select v-model="userStore.selectedLang" @change="fetchMarket">
              <option>en</option>
              <option>ru</option>
              <option>ko</option>
              <option>jp</option>
              <option>tw</option>
            </select>
          </div>
        </div>


        <div class="settings-tile">
          <div>Default worker for hire:</div>
          <div>
            <input type="radio" name="dw" id="dw_f" :value="false" v-model="userStore.useDefaultWorker" />
            <label for="dw_f">Random Artisan Goblin</label>
          </div>
          <div>
            <input type="radio" name="dw" id="dw_t" :value="true" v-model="userStore.useDefaultWorker" />
            <label for="dw_t">Custom
              ({{ formatFixed(gameStore.workerStatsOnPlantzone(userStore.defaultWorker).wspd, 2) }}🔨
              {{ formatFixed(gameStore.workerStatsOnPlantzone(userStore.defaultWorker).mspd, 2) }}🦶
              {{ formatFixed(gameStore.workerStatsOnPlantzone(userStore.defaultWorker).luck, 2) }}🍀)
              <button @click="workerDialogVisible = true">edit</button>
            </label>
          </div>
        </div>


        <div class="settings-tile">
          
          🌻Farming 
          <input type="checkbox" id="fe_t" v-model="userStore.farmingEnable">
          <label for="fe_t">enable</label>
          <span v-if="userStore.farmingEnable">
            <div class="slider-container">
              <span>F2P</span>
              <input 
                type="range"
                style="width:4em"
                v-model.number="userStore.farmingP2WShare" 
                min="0"
                max="80"
                step="10"
              >
              <span>P2W</span>
            </div> 
            (using {{ 80 - userStore.farmingP2WShare }}CP)
            <div style="display: flex;">
              <div>
                Total profit from 10 large fences (use <a href="https://bit.ly/MagicalFarmingProfit">MFP</a> to estimate):<br/>
                  <input type="number" class="float4" v-model.number="userStore.farmingProfit">
                  M$/day with 10 workers 
                <br/>
                  <input type="number" class="float4" v-model.number="userStore.farmingBareProfit">
                  M$/day with 0 workers (half growth speed)
              </div>
            </div>
          </span>
        </div>

        <div class="settings-tile">
          🏭Workshops
          <div>
            <button @click="workshopsConfigVisible = true">config</button>
          </div>
        </div>

        <div v-if="0" class="settings-tile">
          🏛️Palace
          <input type="checkbox" id="pe_t" v-model="userStore.palaceEnable">
          <label for="pe_t">enable (use 5 CP)</label>
          <div v-if="userStore.palaceEnable">
            One worker profit: 
            <input type="number" class="float4" v-model.number="userStore.palaceProfit">
            M$/day
          </div>
        </div>


        <div class="settings-tile">
          🗺️ Map
          <div>
            <input type="checkbox" id="vi_hie" v-model="userStore.mapHideInactive"> hide inactive
          </div>
        </div>

      </div>



      <div class="spacer"></div>
      Market API status:
      <span v-if="marketStore.apiAlive">✓</span>
      <span v-else>❌</span>
      &nbsp;<button @click="reload()">reload</button>
      <p>By default everything marketable is supposed to be sold on Central Market (with tax).</p>
      <p>If the item is for self use, select Keep (=untax) and/or enter Custom price: 
        <button @click="importDialogVisible = true">import</button>
        <button @click="fileExport()">export</button>
        <button @click="clearCustomPrices()">clear</button>
      </p>

    </div>
    <div class="scrollable">
      <table>
        <tr><th>Item</th><th>Market</th><th>Custom</th><th>Keep</th><th>Effective</th></tr>
        <tr v-for="ik in gameStore.itemKeys" :id="'item'+ik">
          <td>
            <a :href="this.userStore.itemUrl+ik">
              <img :src="makeIconSrc(ik)" class="iconitem" :data-key="ik" />
              {{ gameStore.uloc.item[ik] }}
            </a>
            {{ ' ' }}
            <span v-if="ik in marketStore.calculatedPrices">
              <abbr class="tooltip" :title="'contains:\n'+Object.entries(marketStore.calculatedPrices[ik]).map(([cik, cqty]) => formatFixed(cqty, 3) + ' ' + gameStore.uloc.item[cik]).join('\n')">ℹ️</abbr>
            </span>
          </td>
          <td class="right">
            <a v-if="ik in marketStore.apiPrices" :href="this.marketStore.itemPriceUrl(ik)">
              {{ formatFixed(marketStore.apiPrices[ik]) }}
            </a>
            <template v-else>
              {{ formatFixed(gameStore.vendorPrices[ik]) }}
            </template>
          </td>
          <td>
            <input type="number" class="price right" v-model.number="userStore.customPrices[ik]">
          </td>
          <td class="center">
            <input type="checkbox" :disabled="ik in gameStore.vendorPrices" v-model="userStore.keepItems[ik]">
          </td>
          <td class="right">
            {{ formatFixed(marketStore.prices[ik]) }}
          </td>
        </tr>
      </table>

    </div>
  </main>
</template>

<style scoped>

.scrollable {
  overflow: auto;
}
.spacer {
  height: 0.5em;
}

.anim {
  background-color: var(--color-background);
  animation-name: highlight;
  animation-duration: 2s;
}

@keyframes highlight {
  0%   {background-color:var(--color-background); }
  50%  {background-color:hsla(160, 100%, 37%, 0.3); }
  100% {background-color:var(--color-background); }
}
.tooltip {
  cursor: help;
}
input[type="radio"] + label {
  margin-left: 0.3em;
  margin-right: 0.5em;
}

input[type="checkbox"] + label {
  margin-left: 0.3em;
}

.settings-tiles {
  display: flex;
  flex-wrap: wrap;
}

.settings-tile {
  width: auto;
  padding: 4px;
  margin: 2px;
  border: 1px solid gray;
  border-radius: 2px;
}


.slider-container {
    display: inline-flex;
    margin-left: 0.4em;
    align-items: center; /* Align items vertically */
}
.slider {
    margin-right: 10px; /* Add some space between the slider and the text */
}

</style>