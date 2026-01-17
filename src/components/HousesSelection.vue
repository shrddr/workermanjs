<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game.js'
import {formatFixed} from '../util.js'
import WorkerJobDescription from '../components/WorkerJobDescription.vue'
import ItemIcon from '../components/lo/ItemIcon.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore }
  },


  props: {
    tk: Number,
    show: {
      type: Boolean,
      default: false
    }
  },

  components: {
    WorkerJobDescription,
    ItemIcon,
  },

  data: () => ({
    //wantLodging: 0,
    //wantStorage: 0,
  }),

  computed: {
    wantLodging() {
      if (!(this.tk in this.userStore.lodgingP2W))
        this.userStore.lodgingP2W[this.tk] = 0
      const req = this.userStore.townWorkers(this.tk).length
      - this.userStore.lodgingP2W[this.tk]
      - 1
      return req > 0 ? req : 0
    },

    wantStorage() {
      if (!(this.userStore.townsStoreItemkeys[this.tk].size))
        return 0
      if (!(this.tk in this.userStore.storageP2W))
        this.userStore.storageP2W[this.tk] = 0
      if (!(this.tk in this.userStore.storagePersonal))
        this.userStore.storagePersonal[this.tk] = 0
      const req = this.userStore.townsStoreItemkeys[this.tk].size
      + this.userStore.storagePersonal[this.tk]
      - this.userStore.storageP2W[this.tk]
      - this.userStore.baseStorage
      return req > 0 ? req : 0
    },

    bestLookup() {
      return this.gameStore.lsLookup(this.tk, this.wantLodging, this.wantStorage)
    },

    storageViewCount() {
      const ret = this.userStore.baseStorage + this.userStore.storageP2W[this.tk] + this.userStore.townsInfra[this.tk].storage
      return isNaN(ret) ? 0 : ret
    },

    ingameSortedItems() {
      const workeritems = [...this.userStore.townsStoreItemkeys[this.tk]]
      // first by itemType (equipment/material/etc), 
      // then by itemGrade (orange/yellow/blue/green), 
      // and if those are equal then by itemKey (descending)
      workeritems.sort((a, b) => {
        var d = this.gameStore.itemInfo[b].typePriority - this.gameStore.itemInfo[a].typePriority
        if (d) return d
        var d = this.gameStore.itemInfo[b].grade - this.gameStore.itemInfo[a].grade
        if (d) return d
        return b - a
      })
      const personal = Array(this.userStore.storagePersonal[this.tk]).fill('P')
      const ret = workeritems.concat(personal)
      
      if (workeritems.length) {
        ret.push('F')
      }
      return ret
    }
  },

  methods: {
    formatFixed,

    houseCraftPickedTooltip(tk) {
      const ret = []
      this.userStore.townsInfra[tk].indices.forEach((hk, i) => {
        if (this.userStore.townsInfra[tk].states[i] == 0)
          return
        const icon = this.userStore.townsInfra[tk].states[i] == 1 ? '📦' : '🛏️'
        ret.push(icon + this.gameStore.uloc.char[hk])
      })
      return ret.join('\n')
    },

    itemTooltip(tk, ik) {
      const head = this.gameStore.uloc.item[ik]
      let from = ""
      this.userStore.workingWorkers.forEach(worker => {
        if (this.gameStore.jobIsPz(worker.job)) {
          const wstk = this.gameStore.tnk2tk(worker.job.storage)
          const witemkeys = this.gameStore.plantzones[worker.job.pzk].itemkeys
          if (wstk == tk && witemkeys.has(ik)) {
            const pzk = worker.job.pzk
            if (from.length == 0) from += " brought by:\n"
            const worker_town = this.gameStore.uloc.node[worker.tnk]
            from += `${worker_town} worker ${worker.label} from ${this.gameStore.parentNodeName(pzk)}\n`
          }
        }
      })
      return head + from
    },
  },
  
}
</script>

<template>
  <template v-if="tk > 0">

    <table v-if="0">
      <tr>
        <th>jobs</th>
        <th>🛏️</th>
        <th>📦</th>
        <th>M$/day</th>
        <th>CP</th>
        <th v-if="0">🗺️</th>
        <th>M$/day/CP</th>
        <th>Δeff</th></tr>
      <tr>
        <td>personal</td>
        <td></td>
        <td>{{ userStore.storagePersonal[tk] }}</td>
        <td></td>
        <td>{{ userStore.townInfra(tk, 0, 0).cost }}</td>
        <td v-if="0"></td>
        <td></td>
        <td></td>
      </tr>
      
      <tr v-for="s in userStore.townsSteppedInfra[tk]">
        <td>
          <WorkerJobDescription :w="s.w"/>
        </td>
        <td>
          {{ s.curL }}
        </td>
        <td>
          {{ userStore.storagePersonal[tk] + s.curS + 2 }}
        </td>
        <td>
          +{{ formatFixed(s.addI, 2) }}={{ formatFixed(s.curI, 2) }}
        </td>
        <td>
          {{ formatFixed(s.cost) }}
        </td>
        <td v-if="0">
          
        </td>
        <td>
          {{ formatFixed(s.eff, 3) }}
        </td>
        <td>
          {{ formatFixed(s.delta_eff, 3) }}
        </td>
      </tr>
    </table>

    <p><span style="font-size: x-large;">{{ gameStore.uloc.town[tk] }}</span> housing config</p>
    
    <template v-if="tk == 619">
      <input type="checkbox" v-model="userStore.activateAncado"/>
      Connect to nearest town
    </template>

    <div class="section" v-if="tk in gameStore.lodgingPerTown">
      <h3>🛏️ lodging</h3>
      {{ userStore.townWorkingWorkers(tk).length }} used by workers<br/>
      - 1 initial<br/>
      - <input type="number" class="w3em" min="0" max="20" :disabled="tk == 619 && !userStore.activateAncado" v-model.number="userStore.lodgingP2W[tk]">
      from P2W<br/>
      = {{ userStore.townsInfra[tk].wantLodging }} required
      <span v-if="userStore.townsInfra[tk].warnL">← max possible</span>
      <span v-if="userStore.townsInfra[tk].errL" class="red">← too much!</span>
      <br/>
      <strong>
        {{ userStore.townsInfra[tk].lodging }} found
      </strong>
    </div>
    
    <div class="section">
      <div id="storageParent">
        <div id="storageLeft">
          <h3>📦 storage</h3>
          {{ userStore.townsStoreItemkeys[tk] && userStore.townsStoreItemkeys[tk].size }}
          worker items<br/>
          <template v-if="userStore.townsStoreItemkeys[tk] && userStore.townsStoreItemkeys[tk].size > 0">
            + 1 Free slot<br/>
          </template>
          + <input type="number"  class="w42em" min="0" max="192" v-model.number="userStore.storagePersonal[tk]">
          Personal items<br/>
          - {{ userStore.baseStorage }} <span class="markInnate underline">initial</span><br/>
          - <input type="number" class="w42em" min="0" max="192" v-model.number="userStore.storageP2W[tk]">
          {{ ' ' }}<span class="markP2W underline">from P2W</span><br/>
          = {{ userStore.townsInfra[tk].wantStorage }} <span class="markProvided underline">required</span>
          <span v-if="userStore.townsInfra[tk].warnS">← max possible</span>
          <span v-if="userStore.townsInfra[tk].errS" class="red">← too much!</span>
          <br/>
          <strong>{{ userStore.townsInfra[tk].storage }} found</strong>
          {{ userStore.townsInfra[tk].storage - userStore.townsInfra[tk].wantStorage }} <span class="markExtra underline">extra</span>
          
        </div>
        <div id="storageItemList">
          <template v-for="n in storageViewCount">
            <br v-if="n > 1 && (n-1) % 9 == 0"/>
            <div class="storageCell" :class="{ 
              'markInnate' : 0 <= n && n <= userStore.baseStorage, 
              'markP2W' : userStore.baseStorage < n && n <= userStore.baseStorage + userStore.storageP2W[tk], 
              'markProvided' : (userStore.baseStorage + userStore.storageP2W[tk] < n) && (n <= userStore.baseStorage + userStore.storageP2W[tk] + userStore.townsInfra[tk].wantStorage),
              'markExtra' : (userStore.baseStorage + userStore.storageP2W[tk] + userStore.townsInfra[tk].wantStorage < n) && (n <= userStore.baseStorage + userStore.storageP2W[tk] + userStore.townsInfra[tk].storage),
            }">
              <span class="textItem" v-if="n-1 > ingameSortedItems.length"></span>
              <span class="textItem" v-else-if="isNaN(ingameSortedItems[n-1])">{{ ingameSortedItems[n-1] }}</span>
              <abbr v-else :title="itemTooltip(tk, ingameSortedItems[n-1])" class="hastooltip">
                <ItemIcon :ik="Number(ingameSortedItems[n-1])"/>
              </abbr>
              
            </div>
          </template>
        </div>
      </div>
    </div>

    <details>
      <summary>Found cost: {{ userStore.townsInfra[tk].cost }} CP</summary>
      <pre class="fsxs">{{ userStore.townsInfra[tk].success ? houseCraftPickedTooltip(tk) : 'FAILED' }}</pre>
      
    </details>

  </template>
</template>

<style scoped>
summary {
  cursor: pointer;
}
.section {
  border: 1px solid gray;
  padding: 2px;
  margin: 2px;
}
.red {
  color: red;
}
strong {
  font-weight: 600;
}
#storageParent {
  display: flex;
}
.textItem {
  display: inline-block;
  text-align: center;
  width: 22px;
}
.storageCell {
  display: inline-block;
  height: 24px;
  vertical-align: top;
  border-bottom: 2px solid;
  margin: 1px;
}
.storageCell abbr {
  display: inline-block;
  height: 22px;
  vertical-align: top;
  margin-top: -2px;
}
.underline {
  border-bottom: 2px solid;
}
.markInnate {
  border-color: rgba(0, 116, 148, 0.45);
}
.markP2W {
  border-color: rgba(0, 128, 0, 0.45);
}
.markProvided {
  border-color: rgba(140, 110, 0, 0.6);
}
.markExtra {
  border-color: rgba(172, 0, 0, 0.45);
}
.tooltip {
  cursor: help;
}
</style>

