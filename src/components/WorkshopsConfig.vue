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
    show: {
      type: Boolean,
      default: false
    }
  },

  created() {
    this.fetchData()
  },

  data: () => ({
    houses: {},
    towns: [-1],
    usages: [-1],
    levels: [-1],
    filterTown: -1,
    filterUsage: -1,
    filterLevel: -1,
    selectedHouse: -1,
  }),

  computed: {
    filteredTowns() {
      const s = new Set([-1])
      for (const [k, v] of Object.entries(this.houses))
        if (this.filterUsage == -1 || this.filterUsage in v.CraftList)
          if (this.filterLevel == -1 || this.filterLevel <= v.CraftList[this.filterUsage])
            if (v.affTown != 694)  
              s.add(v.affTown)
      return [...s].sort((a,b)=>a-b)
    },

    filteredUsages() {
      const s = new Set([-1])
      for (const [k, v] of Object.entries(this.houses))
        if (this.filterTown == -1 || v.affTown == this.filterTown)
          for (const [u, l] of Object.entries(v.CraftList))
            if (u > 10)
              s.add(u)
      return [...s].sort((a,b)=>a-b)
    },

    filteredLevels() {
      const s = new Set([-1])
      if (this.filterUsage != -1) {
        for (const [k, v] of Object.entries(this.houses))
          if (this.filterTown == -1 || v.affTown == this.filterTown)
            if (this.filterUsage in v.CraftList)
              s.add(v.CraftList[this.filterUsage])
      }
      return [...s].sort((a,b)=>a-b)
    },

    filteredHouses() {
      const ret = []
      for (const [k, v] of Object.entries(this.houses)) {
        if (this.filterTown == -1 || v.affTown == this.filterTown)
          if (this.filterUsage == -1 || this.filterUsage in v.CraftList)
            if (this.filterLevel == -1 || this.filterLevel <= v.CraftList[this.filterUsage])
              ret.push(Number(k))
      }
      //console.log('filteredHouses', ret)
      return ret
    },
  },

  methods: {
    formatFixed,

    async fetchData() {
      this.houses = await (await fetch(`data/houseinfo.json`)).json()
      const _towns = new Set([-1])
      const _usages = new Set([-1])
      for (const [hk, info] of Object.entries(this.houses)) {
        _towns.add(info.affTown)

        for (const [u, lvl] of Object.entries(info.CraftList)) {
          if (u > 10)
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

    addWorkshop(hk) {
      this.userStore.userWorkshops[hk] = { ...this.userStore.defaultUserWorkshop }
    },

    deleteWorkshop(hk) {
      delete this.userStore.userWorkshops[hk]
    },
  },

  
  
}
</script>

<template>
  <h3>🏭Workshops config</h3>

  <table class="sa">
    <tr>
      <th>House</th>
      <th>
        label
        <abbr class="tooltip" title="for display only">ℹ️</abbr>
      </th>
      <th>
        worktype
        <abbr class="tooltip" title="used to factor in some worker skills.
also, only Mass Production can employ multiple workers at once.">ℹ️</abbr>
      </th>
      <th>
        workload
      </th>
      <th>
        $/cycle 
        <abbr title="use Sho's Workshop Profitability Calculator & gpw Trading/Crates Calculator to find out.
For crates, enter profit per 1 crate - if a worker with +1/+3 packing skill occupies this workshop it will be taken into account." class="tooltip">ℹ️</abbr>
      </th>
      <th>
        CP
        <abbr title="Full cost of operating the workshop, including:
1) the workshop itself;
2) house chain to connect the workshop (*after* autoassigned houses shown in Home > town config > Found cost spoiler);
3) storage for input/output mats, if not provided by (2).
The only thing to not include here is lodging for the worker who is going to occupy the workshop.
However, if your workshop house chain does provide lodging, reduce (2) accordingly. 
The house chain can potentially provide storage and lodging not only for this workshop, but for other workshops of this town. 
In this case, use average CP value (sum up all workshop-related CP costs and divide by active workshop count)." class="tooltip">ℹ️</abbr>
      </th>
      <th>action</th>
    </tr>

    <tr v-for="v, hk in userStore.userWorkshops">
      <td>
        {{ gameStore.uloc.char[hk] }}
      </td>
      <td><input class="w5em" v-model.number="v.label"/></td>
      <td><select v-model="v.industry">
        <option value="unk">unknown</option>
        <option value="jewelry">jewelry</option>
        <option value="mass">mass</option>
        <option value="weap">weapon</option>
        <option value="tool">tool</option>
        <option value="furn">furniture</option>
        <option value="costume">costume</option>
        <option value="refine">refine</option>
        <option value="siege">siege</option>
        <option value="mount">mount</option>
        <option value="exclus">exclusive</option>
        <option value="pack_produce">pack_produce</option>
        <option value="pack_herb">pack_herb</option>
        <option value="pack_mushr">pack_mushr</option>
        <option value="pack_fish">pack_fish</option>
        <option value="pack_timber">pack_timber</option>
        <option value="pack_ore">pack_ore</option>
      </select></td>
      <td><input type="number" class="w5em" v-model.number="v.manualWorkload"/></td>
      <td><input type="number" class="w5em" v-model.number="v.manualCycleIncome"/></td>
      <td><input type="number" class="float4" v-model.number="v.manualCp"/></td>
      <td><button @click="deleteWorkshop(hk)">delete</button></td>
    </tr>

  </table>

  new entry:<br/>
  
  <table class="borderless">
    <tr>
      <td>town</td>
      <td>
        <select v-model="filterTown">
          <option v-for="tk in filteredTowns" :value="tk">{{ tk>=0 ? gameStore.uloc.town[tk] : 'any'}}</option>
        </select>
      </td>
    </tr>
    <tr>
      <td>usage</td>
      <td>
        <select v-model="filterUsage">
          <option v-for="u in filteredUsages" :value="u">{{ u>=0 ? gameStore.uloc.housetype[u] + ' ' + u : 'any'}}</option>
        </select>
      </td>
    </tr>
    <tr>
      <td>level</td>
      <td>
        <select v-model="filterLevel">
          <option v-for="l in filteredLevels" :value="l">{{ l>=0 ? l + '+' : 'any'}}</option>
        </select>
      </td>
    </tr>
    <tr>
      <td>house</td>
      <td>
        <select v-model="selectedHouse">
          <option v-for="hk in filteredHouses" :value="hk">{{ hk }} {{ gameStore.uloc.char[hk] }} {{ hk in userStore.userWorkshops ? '✔️' : '' }}</option>
        </select>
      </td>
    </tr>
  </table>

  <button :disabled="selectedHouse == -1 || selectedHouse in userStore.userWorkshops" @click="addWorkshop(selectedHouse)">add</button>
  <span v-if="selectedHouse in userStore.userWorkshops" class="fsxs">
    already in list!
  </span>

  Note that assigning house as workshop does not prevent it from being used for autolodging/autostorage on Home page. You need to manually work around this.

</template>

<style scoped>

.tooltip {
  cursor: help;
}

</style>