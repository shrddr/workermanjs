<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {formatFixed} from '../util.js'

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
    tk: String,
    o: Object,
    show: {
      type: Boolean,
      default: false
    }
  },

  methods: {
    formatFixed,
  },

  
  
}
</script>

<template>
  <template v-if="o">
    <h3>{{ gameStore.uloc.town[tk] }} lodging config</h3>

    <template v-if="tk == 619">
      <input type="checkbox" v-model="userStore.activateAncado"/>
      Connect to nearest town
    </template>
  
    <table>
      <tr>
        <th>House</th>
        <th>🛏️</th>
        <th>CP</th>
      </tr>

      <tr v-for="house in o.houses">
        <td>
          <input type="checkbox" 
            :disabled="tk == 619 && !userStore.activateAncado" 
            v-model="userStore.lodgingTaken[house.key]">
          {{' '}}
          <a :href="'https://bdocodex.com/us/npc/'+house.key">
            {{ gameStore.uloc.char[house.key] }}
          </a>
        </td>
        <td>{{ house.lodgingSpaces }}</td>
        <td>{{ house.CP }}</td>
      </tr>

      <tr>
        <td>
          <input type="number" :disabled="tk == 619 && !userStore.activateAncado" v-model.number="userStore.lodgingP2W[tk]" class="short">
          P2W slots →
          Total:
        </td>
        <td>
          {{ userStore.haveLodging.slots.perTown[tk] }}
        </td>
        <td>
          {{ userStore.haveLodging.cp.perTown[tk] }}
        </td>
      </tr>
    </table>

    
  </template>
</template>