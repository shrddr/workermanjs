<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import ItemIcon from '../components/lo/ItemIcon.vue'

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

  components: {
    ItemIcon,
  },

  data: () => ({
    houses: {},
    houseCrafts: {},
    towns: new Set([-1]),
    usages: [-1],
    filterTown: -1,
    filterUsage: -1,
  }),

  created() {
    this.fetchData()
  },

  mounted() {
  },

  watch: {
  },

  methods: {
    async fetchData() {
      this.houseCrafts = await (await fetch(`data/houseinforeceipe.json`)).json()
      this.houses = await (await fetch(`data/houseinfo.json`)).json()
      const _towns = new Set([-1])
      const _usages = new Set([-1])
      for (const [hk, info] of Object.entries(this.houses)) {
        _towns.add(info.affTown)

        for (const [u, lvl] of Object.entries(info.CraftList)) {
          _usages.add(u)
        }

        this.houses[hk].CPfull = this.houses[hk].CP
        let dep = info.needHouseKey
        while (dep) {
          this.houses[hk].CPfull += this.houses[dep].CP
          dep = this.houses[dep].needHouseKey
        }
      }
      this.towns = _towns
      this.usages = [..._usages].sort((a,b)=>a-b)
    },


  },

  computed: {
    craftables() {
      let count = 0
      for (const [n, crafts] of Object.entries(this.houseCrafts[this.filterUsage].groups)) {
        for (const craft of crafts) {
          if (craft in this.gameStore.craftInputs) count += 1
        }
      }
      return count
    },
  },

}
</script>

<template>
  <main>
    <div id="toptext">
      Town:
      <select v-model="filterTown">
        <option v-for="tk in towns" :value="tk">{{ tk>=0 ? gameStore.uloc.town[tk] : 'any'}}</option>
      </select>

      Usage:
      <select v-model="filterUsage">
        <option v-for="u in usages" :value="u">{{ u>=0 ? gameStore.uloc.housetype[u] + ' ' + u : 'any'}}</option>
      </select>

      <details v-if="filterUsage != -1">
        <summary>Craftables ({{ craftables }} stackable)</summary>
        <div v-for="crafts, n in this.houseCrafts[filterUsage].groups">
          level {{ n+1 }}:
            <table>
            <tr v-for="craft in crafts">
              <template v-for="ik in this.gameStore.craftOutputs[craft]">
                <a :href="this.userStore.itemUrl+ik">
                  <ItemIcon :ik="ik" :with_name="true"/>
                </a>
              </template>
            </tr>
          </table>
        </div>
      </details>
    </div>

    <table>
    <tr>
      <th>town</th>
      <th>node</th>
      <th>name</th>
      <th>CP</th>
      <th>usage/level</th>
    </tr>
    <template v-for="v, k in houses">
      <tr v-if="(filterTown == -1 || v.affTown == filterTown) && (filterUsage == -1 || filterUsage in v.CraftList)">
        <td>{{ v.affTown }}</td>
        <td>{{ v.parentNode }}</td>
        <td>
          <a :href="'https://bdocodex.com/us/npc/'+v.key">{{ gameStore.uloc.char[v.key] }}</a>
        </td>
        <td>{{ v.CP }} ({{ v.CPfull }})</td>
        <td>
          <span v-for="level, housetype in v.CraftList">
          {{ gameStore.uloc.housetype[housetype] }}<sup>{{ level }}</sup>{{' '}}
          </span>
        </td>
      </tr>
    </template>
    </table>

  </main>
</template>
