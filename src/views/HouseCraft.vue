<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {formatFixed} from '../util.js'

import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { TreeChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import VChart, { THEME_KEY } from "vue-echarts";
import { ref, defineComponent } from "vue";

use([
  CanvasRenderer,
  TreeChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
]);

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

  components: {
    VChart,
  },

  props: {
    show: {
      type: Boolean,
      default: false
    }
  },

  data: () => ({
    tk: 5,
    wantLodging: 0,
    wantStorage: 0,
  }),

  computed: {
    townsWithHouses() {
      const ret = []
      if (!this.gameStore.ready) return ret
      // first of all, only consider manually assigned as "towns" in game.js
      // since housecraft data files don't cover Kusha, Abun, etc
      for (const tnk of this.gameStore.townsWithLodging) {
        const tk = this.gameStore.tnk2tk(tnk)
        // towns with no houses are not localized -> don't show in dropbox
        if (tk in this.gameStore.uloc.town) {
          ret.push(tk)
        }
      }
      //console.log('townsWithHouses', ret)
      return ret
    },
    bestLookup() {
      return this.gameStore.lsLookup(this.tk, this.wantLodging, this.wantStorage)
    },
    sortedResult() {
      const ret = []
      const lookup = this.bestLookup
      //console.log(lookup)
      if (lookup && lookup.success) {
        for (let idx = 0; idx < lookup.indices.length; idx++) {
          const hk = lookup.indices[idx]
          const name = this.gameStore.uloc.char[hk]
          const state = lookup.states[idx]
          ret.push({hk, name, state})
        }
        ret.sort((a,b)=>('' + a.name).localeCompare(b.name))
      }
      return ret
    },
    storageCost() {
      let ret = 0
      for (const e of this.sortedResult) {
        if (e.state == 1) {
          ret += this.gameStore.houseCost(e.hk)
        }
      }
      return ret
    },
    lodgingCost() {
      let ret = 0
      for (const e of this.sortedResult) {
        if (e.state == 2) {
          ret += this.gameStore.houseCost(e.hk)
        }
      }
      return ret
    },
    townChains() {
      const ret = {}
      for (const hk of this.gameStore.housesPerTown[this.tk]) {
        ret[hk] = []
        let hkIter = Number(hk)
        while (hkIter != 0) {
          ret[hk].unshift(hkIter)
          hkIter = this.gameStore.houseInfo[hkIter].needHouseKey
        }
      }
      //console.log('townChains', ret)
      return ret
    },
    townTree() {
      const ret = {
        name: '', 
        value: this.gameStore.uloc.town[this.tk], 
        children: []
      }
      if (!this.gameStore.ready)
        return ret
      if (!this.bestLookup.success) {
        console.log('bestlookup failed for tk', this.tk)
        return ret
      }
      for (const hk of this.gameStore.housesPerTown[this.tk]) {
        let treeIter = ret
        for (const chainIter of this.townChains[hk]) {
          const found = treeIter.children.findIndex(obj => obj.name == chainIter)
          //console.log('treeIter', treeIter, found)
          if (found >= 0) {
            treeIter = treeIter.children[found]
          }
          else {
            let state = 0
            if (this.bestLookup) {
              const idx = this.bestLookup.indices.indexOf(chainIter)
              if (idx !== -1) {
                state = this.bestLookup.states[idx]
              }
            }
            
            const newChild = {
              name: chainIter,
              value: {
                label: this.gameStore.uloc.char[chainIter],
                lodging: this.gameStore.houseLodging(chainIter),
                storage: this.gameStore.houseStorage(chainIter),
                cp: this.gameStore.houseCost(chainIter)
              },
              lineStyle: treeIter.name == 0 ? { color: 'transparent' } : state > 0 ? (state == 2 ? { color: '#fe6' } : { color: '#a5f' }) : {},
              itemStyle: state > 0 ? (state == 2 ? { color: '#fe6' } : { color: '#a5f' }) : {},
              children: []
            }
            treeIter.children.push(newChild)
            treeIter = newChild
          }
        }
      }
      if (this.tk == 1553) console.log('townTree', ret)
      return ret
    },
    chartOption() {
      return {
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove',
          formatter: function(p) {
            const v = p.value
            if (p.name == 0)
              return v
            return `${p.name} ${v.label}<br/>${v.lodging}🛏️ ${v.storage}📦 ${v.cp}CP`
          }
        },
        series: [
          {
            type: 'tree',
            //orient: 'TB',
            layout: 'radial',
            roam: true,
            data: [this.townTree],
            top: '1%',
            left: '1%',
            bottom: '1%',
            right: '1%',
            symbolSize: 6,
            initialTreeDepth: 9,
            label: {
              fontSize: 9,
              color: 'gray',
              position: 'top',
              //verticalAlign: 'middle',
              //align: 'right',
              formatter: function(p) {
                const v = p.value
                if (p.name == 0)
                  return ''
                return `{r|${v.lodging}} {o|${v.storage}} ${v.cp}`
              },
              rich: {
                r: {
                  fontSize: 9,
                  //color: 'red',
                },
                o: { 
                  fontSize: 9, 
                  //color: 'orange',
                },
              },
            },
            leaves: {
              label: {
              }
            },
            emphasis: {
              focus: 'descendant'
            },
            //expandAndCollapse: true,
          }
        ]
      }
    },
  },

  methods: {
    formatFixed,
  },
  
}
</script>

<template>
  <main>
    <div class="limit">
      <div id="controls">
        <p>data from <a href="https://github.com/Thell/bdo-housecraft">Thell/bdo-housecraft</a></p>

        <div id="fluid">
          <div id="sliders">
            <table v-if="this.gameStore.ready">
              <tr><th></th><th>wanted</th><th>found</th><th>cost</th><th>per CP</th></tr>
              <tr>
                <th class="lodging">lodging </th>
                <th><input 
                  type="range"
                  class="wlong"
                  v-model.number="wantLodging" 
                  min="0"
                  :max="Math.min((gameStore.ready ? gameStore.townUpperLimits[tk].lodging : 999), 100)"
                >{{ wantLodging }}</th>
                <th>{{ bestLookup ? bestLookup.lodging : '?' }}</th>
                <th>{{ lodgingCost }} CP</th>
                <th>{{ bestLookup ? formatFixed(bestLookup.lodging / lodgingCost, 3) : '?' }}</th>
              </tr>
              <tr>
                <th class="storage">storage</th>
                <th><input 
                  type="range"
                  class="wlong"
                  v-model.number="wantStorage" 
                  min="0"
                  :max="Math.min((gameStore.ready ? gameStore.townUpperLimits[tk].storage : 999), 192-8)"
                >{{ wantStorage }}</th>
                <th>{{ bestLookup ? bestLookup.storage : '?' }}</th>
                <th>{{ storageCost }} CP</th>
                <th>{{ bestLookup ? formatFixed(bestLookup.storage / storageCost, 3) : '?' }}</th>
              </tr>
              <tr>
                <th colspan="3">
                  town <select v-model="tk"><option v-for="tk in this.townsWithHouses" :value="tk">{{ gameStore.uloc.town[tk] }}</option></select>
                </th>
                <th colspan="2">{{ bestLookup ? bestLookup.cost : '?' }} CP total</th>
              </tr>
            </table>
          </div>

          
        </div>

        
      </div>

      <div style="clear:both;"></div>
      <div id="houselist" v-if="bestLookup">
        <template v-for="e in sortedResult">
          <p v-if="e.state > 0" :class="{storage: e.state == 1, lodging: e.state == 2}">
            {{ e.name }}
          </p>
        </template>
      </div>

      <v-chart class="chart" :option="chartOption" />

    </div>
  </main>

</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  height: 96%;
  overflow: hidden;
}

.limit {
  width: 100%;
  height: 100%;
}

#controls, #houselist {
  float: left;
  z-index: 1;
}

.wlong {
  width: 15em;
}

/* Tooltip container */
.tooltip {
  position: relative;
  display: inline-block;
  border-bottom: 1px dotted gray; /* If you want dots under the hoverable text */
}

.sTaken {
  background-color: rgb(75, 58, 22);
}
.lTaken {
  color: rgb(214, 48, 42);
}

/* Tooltip text */
.tooltip .tooltiptext {
  visibility: hidden;
  width: 120px;
  background-color: black;
  color: #fff;
  text-align: center;
  padding: 5px 0;
 
  /* Position the tooltip text */
  position: absolute;
  z-index: 1;
  bottom: 100%;
  left: 50%;
  margin-left: -60px;
}

/* Show the tooltip text when you mouse over the tooltip container */
.tooltip:hover .tooltiptext {
  visibility: visible;
}

#houselist {
  margin-top: 0.2em;
  list-style: none;
  padding: 0;
  font-size: small;
}

.lodging {
  color: #fe6;
}
.storage {
  color: #a5f;
}

#fluid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}

#cost {
  display: flex;
  align-items: center;
}
</style>