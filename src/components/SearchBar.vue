<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import ItemIcon from '../components/lo/ItemIcon.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    return { gameStore, userStore }
  },

  props: {
    visible: Boolean,
  },
  emits: ["close", "select"],

  components: {
    ItemIcon,
  },

  data() {
    return {
      searchQuery: "",
      searchResults: [],
      emptySet: new Set([]),
    };
  },
  computed: {
    itemNamesKeys() {
      const ret = {}
      if (!this.gameStore.ready) return ret
      Object.keys(this.gameStore.itemkeyPlantzones).forEach(ik => {
        const name = this.gameStore.uloc.item[ik]
        ret[name] = Number(ik)
      })
      //console.log('SearchBar itemNamesKeys', ret)
      return ret
    },
  },
  watch: {
    searchQuery(newQuery) {
      this.searchResults = {}  // itemKey: [list of nodes to highlight]
      let count = 0
      for (const [iname, ik] of Object.entries(this.itemNamesKeys)) {
        if (iname.toLowerCase().includes(newQuery.toLowerCase())) {
          this.searchResults[iname] = {
            hlSet: ik in this.gameStore.itemkeyPlantzones ? this.gameStore.itemkeyPlantzones[ik] : new Set([]),
            type: 'dropsItem',
            itemKey: ik,
          }
          count++
          if (count >= 10) break
        }
      }
      count = 0
      let countk = 0
      for (const [nodeKey, nodeName] of Object.entries(this.gameStore.uloc.node)) {
        if (nodeName.toLowerCase().includes(newQuery.toLowerCase())) {
          if (!(nodeName in this.searchResults)) {
            this.searchResults[nodeName] = {
              type: 'name',
              hlSet: new Set([]),
            }
          }
          this.searchResults[nodeName].hlSet.add(Number(nodeKey))
          count++
          if (count >= 10) break
        }
        const nodeKeyStr = `${nodeKey}`
        if (nodeKeyStr.toLowerCase().includes(newQuery.toLowerCase())) {
          if (!(nodeKeyStr in this.searchResults)) {
            this.searchResults[nodeKeyStr] = {
              type: 'key',
              hlSet: new Set([]),
            }
          }
          this.searchResults[nodeKeyStr].hlSet.add(Number(nodeKey))
          count++
          if (count >= 10) break
        }
      }
      

      //console.log(this.searchResults)
    },
  },
  methods: {
    onInput() {
      if (this.searchQuery === "") {
        this.searchResults = {}
      }
    },
    selectItem(pzkList) {
      this.$emit("select", pzkList)
      this.$emit("close")
    },
    focusInput() {
      //console.log('focusing')
      this.$refs.searchInput?.focus()
    },
  },
};
</script>

<style>
.search-bar {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px;
  z-index: 1000;
  background: var(--color-background-soft);
}
.search-bar input {
  width: 200px;
  padding: 2px;
  margin-right: 10px;
}
.search-bar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.search-bar li {
  padding: 2px;
  cursor: pointer;
}
.search-bar li:hover {
  background: var(--color-background-mute);
}
</style>

<template>
  <div v-if="visible" class="search-bar">
    <input 
      type="text" 
      v-model="searchQuery" 
      @input="onInput"
      ref="searchInput"
      placeholder="Search..."
    />
    <button @click="selectItem(emptySet)">reset</button>
    <ul v-if="searchResults">
      <li v-for="(data, str) in searchResults" 
          @click="selectItem(data.hlSet)">

        <template v-if="data.type == 'dropsItem'">
          <ItemIcon :ik="data.itemKey"/> {{ str }} ({{ data.hlSet.size }} nodes)
        </template>
        <template v-else-if="data.type == 'name'">
          🗺️ {{ str }}
        </template>
        <template v-else-if="data.type == 'key'">
          🗺️ {{ str }} - {{ gameStore.uloc.node[str] }}
        </template>
      </li>
    </ul>
  </div>
</template>