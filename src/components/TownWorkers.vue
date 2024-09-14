<script>
import {useGameStore} from '../stores/game.js'
import {useUserStore} from '../stores/user.js'
import Worker from '../components/Worker.vue'
import {formatFixed} from '../util.js'

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()

    /*userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })*/

    return { gameStore, userStore }
  },

  props: {
    o: Object,
    tk: Number,
  },

  emits: [
    'selectLodging',
    'selectHouses',
    'hireWorker',
    'editWorker',
    'sendWorker',
    'panToPaPos',
  ],

  components: {
    Worker,
  },

  data: () => ({
  }),

  computed: {

    infra() {
      if (this.tk in this.userStore.townsInfra) {
        return this.userStore.townsInfra[this.tk]
      }
      else {
        console.log(this.userStore.townsInfra)
        throw new Error(`no infra for town: ${this.tk}`)
      }
    },

  },

  methods: {
    formatFixed,

    fireWorker(who) {
      this.userStore.userWorkers = this.userStore.userWorkers.filter(w => w != who)
    },
  },
}

</script>

<template>

  
  <tr>
    <td colspan="2">
      <template v-if="o">
        worker
        <button 
          @click="this.$emit('hireWorker', tk)"
        >
        hire
        </button>
      </template>
      <template v-else>
        workers not hireable
      </template>
    </td>

    <td class="center">🔨</td>
    <td class="center">🦶</td>
    <td class="center">🍀</td>

    <td colspan="3" :class="{ 'unresolved': gameStore.ready && infra.success == false }">
      
      <span @click="$emit('panToPaPos', this.gameStore.nodes[this.gameStore.tk2tnk(tk)].pos)" class="bold clickable">
        {{ gameStore.nodeName(gameStore.tk2tnk(tk)) }}
      </span>
      {{  }}
      <template v-if="userStore.displayProfitPerCp">
        {{ formatFixed(userStore.townsTotalIncome[tk] && userStore.townsTotalIncome[tk].eff, 2) }} M$/day/CP
      </template>
      <template v-else>
        {{ formatFixed(userStore.townsTotalIncome[tk] && userStore.townsTotalIncome[tk].income, 1) }} M$/day
      </template>
      &nbsp;

      
      <span>
        {{ userStore.townWorkingWorkers(tk).length }}
        🛏️
        <span>
          {{ userStore.townsStoreItemkeys[tk] && userStore.townsStoreItemkeys[tk].size }}
        </span>
        📦
        {{ gameStore.ready && userStore.townsInfra[tk].cost }}
        CP
        
        <button @click="this.$emit('selectHouses', tk)" :class="{ 'unresolved': gameStore.ready && userStore.townsInfra[tk].success == false }">
          config
        </button>
        
      </span>
    </td>
  </tr>

  <template v-for="w, n in userStore.userWorkers.filter(w => gameStore.tnk2tk(w.tnk) == tk)">
    <Worker 
      :w="w" 
      :homeless="true"
      :class="{ homeless: 0 && (n > userStore.haveLodging.slots.perTown[tk] - 1)}"
      :unsendable="tk == 619 && !userStore.activateAncado"
      @fire="fireWorker(w)"
      @edit="this.$emit('editWorker', w)"
      @send="this.$emit('sendWorker', w)"
      @panToPaPos="this.$emit('panToPaPos', $event)"
    />
  </template>
  
  
    
  
</template>



<style scoped>
.townbox {
  margin-top: 0.8em;
}
.unresolved {
  background-color: rgba(255, 0, 0, 0.2);
}
button.unresolved {
  border-color: rgba(255, 0, 0, 0.7);
}
</style>
