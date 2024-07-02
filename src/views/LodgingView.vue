<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'

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
  data: () => ({

  }),

  created() {

  },

  mounted() {
  },

  watch: {
    
  },

  methods: {
    
  }
}
</script>

<template>
  <main>
    
    Total lodging slots: {{ userStore.haveLodging.slots.total }}<br/>
    Total CP spent: {{ userStore.haveLodging.cp.total }}<br/>

    <table>
      <tr>
        <th></th>
        <th>Town / House</th>
        <th>Lodging</th>
        <th>CP</th>
      </tr>
      <template v-for="(o, tk) in gameStore.lodgingPerTown">
        <tr>
          <td></td>
          <td>
            <span class="header">{{ gameStore.uloc.town[tk] }}</span>
            P2W: <input type="number" v-model.number="userStore.lodgingP2W[tk]" class="short">
          </td>
          <td>
            {{ userStore.haveLodging.slots.perTown[tk] }}
          </td>
          <td>
            {{ userStore.haveLodging.cp.perTown[tk] }}
          </td>
        </tr>
        <tr v-for="house in o.houses">
          <td>
            <input type="checkbox" v-model="userStore.lodgingTaken[house.key]">
          </td>
          <td><a :href="'https://bdocodex.com/us/npc/'+house.key">{{ gameStore.uloc.char[house.key] }}</a></td>
          <td>{{ house.lodgingSpaces }}</td>
          <td>{{ house.CP }}</td>
        </tr>
      </template>
    </table>

  </main>
</template>
