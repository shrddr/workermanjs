<script>
import {useUserStore} from '../stores/user'
import {useRoutingStore} from '../stores/routing'
import {useGameStore} from '../stores/game'
import {formatFixed} from '../util.js'
import ItemIcon from '../components/lo/ItemIcon.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const routingStore = useRoutingStore()
    const gameStore = useGameStore()
    return { gameStore, userStore, routingStore }
  },

  props: {
    e: Object,
    showGiantValues: Boolean
  },

  components: {
    ItemIcon,
  },

  methods: {
    formatFixed,

    formatDropQty(val) {
      if (val < 0.1) return formatFixed(val, 3)
      return formatFixed(val, 2)
    },
  },

  computed: {
    actualWorker() {
      return this.routingStore.pzJobs[this.e.key].worker
    },

    takenInfo() {
      const assigned = this.userStore.workedPlantzones.has(this.e.key.toString())
      if (!assigned) return {icon: '❌', text: "not assigned"}

      if (this.actualWorker.tnk != this.e.tnk) {
        let text = `town used: ${this.gameStore.nodeName(this.actualWorker.tnk)}\n` + 
                   `suggested: ${this.gameStore.nodeName(this.e.tnk)}`
        if (this.actualWorker.tnk in this.e.alt_towns_profits) {
          const ratio = this.e.dailyPerCp / this.e.alt_towns_profits[this.actualWorker.tnk]
          text += ` (${formatFixed(ratio * 100 - 100)}% better)`
        }
        return {icon: '⚠️', text}
      }
      
      if (this.actualWorker.charkey != this.e.charkey) {
        let text = `worker used: ${this.gameStore.uloc.char[this.actualWorker.charkey]}\n` + 
                   `suggested: ${this.gameStore.uloc.char[this.e.charkey]}`
        let icon = '⚠️'
        if (this.actualWorker.charkey in this.e.alt_workers_profits) {
          const ratio = this.e.priceDaily / this.e.alt_workers_profits[this.actualWorker.charkey]
          if (ratio < 1.1) icon = '✔️'
          text += ` (${formatFixed(ratio * 100 - 100)}% better)`
        }
        return {icon, text}
      }

      return {icon: '✔️', text: "all good"}
    },
  },

}

</script>

<template>
  <tr>
    <td>
      <RouterLink tag="a" :to="{path: './', hash: '#node' + e.key}">
        {{ gameStore.plantzoneName(e.key) }}
      </RouterLink>
    </td>
    <td>
      <div v-for="q, k in e.unlucky">
        <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
          <span>
            {{ formatDropQty(q) }}
            <ItemIcon :ik="Number(k)" :with_name="true"/>
          </span>
        </RouterLink>
        <span class="fss" v-if="showGiantValues"> [{{ formatDropQty(e.unlucky_gi[k]) }}] </span>
      </div>
    </td>
    <td class="tac">
      <div v-for="q, k in e.lucky">
        <RouterLink tag="a" :to="{path: './settings', hash: '#item' + k}">
          {{ formatDropQty(q) }}&nbsp;<ItemIcon :ik="Number(k)"/>
        </RouterLink>
      </div>
    </td>
    <td class="tac">
      <div v-if="showGiantValues">
        {{ formatFixed(e.cycleValue_gob, 0) }}
        <span class="fss">[{{ formatFixed(e.cycleValue_gi, 0) }}]</span>
      </div>
      <div v-else>
        {{ formatFixed(e.cycleValue, 0) }}
      </div>
    </td>
    <td class="tac">
      <abbr class="tooltip nound" :title="e.alt_towns.map(obj => `${gameStore.nodeName(obj.tnk)}: ${formatFixed(obj.dailyPerCp, 2)} M$/day/CP → ${formatFixed(100*obj.dailyPerCp/e.dailyPerCp)}%`).join('\n')">{{ gameStore.nodeName(e.tnk) }}</abbr>
    </td>
    <td class="tac">{{ formatFixed(e.dist, 0) }}</td>
    <td class="tac">{{ e.cp }}</td>
    <td class="tac">
      <abbr class="tooltip nound" :title="e.alt_workers.map(obj => `${gameStore.uloc.char[obj.charkey]}: ${formatFixed(obj.priceDaily, 2)} M$/day → ${formatFixed(100*obj.priceDaily/e.priceDaily)}%`).join('\n')">{{ {'goblin':'👺','giant':'🐢', 'human':'👨'}[e.kind] }}</abbr>
    </td>
    <td class="tac">{{ formatFixed(e.wspd+5, 1) }}</td>
    <td class="tac">
      <template v-if="userStore.allowFloating && userStore.useFloatingResources[e.regiongroup]">
        ~{{ formatFixed(userStore.medianWorkloads[e.key], 2) }}
      </template>
      <template v-else>
        {{ formatFixed(e.activeWorkload, 2) }}
      </template>
    </td>
    <td class="tac">{{ formatFixed(e.cyclesDaily, 1) }}</td>
    <td class="tac">{{ formatFixed(e.priceDaily, 2) }}</td>
    <td class="tac">{{ formatFixed(e.dailyPerCp, 3) }}</td>
    <td class="tac" v-if="userStore.workedPlantzones.size">
      <abbr class="tooltip nound" :title=takenInfo.text>{{ takenInfo.icon }}</abbr>
    </td>
  </tr>
</template>

<style scoped>

.tar {
  text-align: right;
}
.tac {
  text-align: center;
}
.tooltip {
  cursor: help;
}

.nound {
  text-decoration: none;
}

/* for stickiness */

td {
  border-top: none;  /* keep: right, bottom  */
  border-left: none;
}

tr td:first-child {
  border-left: 1px solid gray;  /* re-introduce the left border again */
}

tr {
  scroll-margin-top: 100px;  /* for navigating to the row */
}

</style>
