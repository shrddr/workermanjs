<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {formatFixed} from '../util.js'
import ModalDialog from '../components/ModalDialog.vue'
import FloatingModifierEdit from '../components/FloatingModifierEdit.vue'

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
    FloatingModifierEdit,
  },

  data: () => ({
    floatingDialogWspd: 150,
    floatingDialogRgroup: 1,
    floatingDialogWkld: 400,
    floatingDialogVisible: false,
    importDialogVisible: false,
  }),
  watch: {
    'userStore.useFloatingModifiers': {
      handler(newValue, oldValue) {
        // catch individual switches
      },
      deep: true
    },
  },
  methods: {
    formatFixed,

    fileParse(event) {
      let str = event.target.result
      let json = JSON.parse(str)
      this.userStore.$patch(json)
      this.setAllFloating(true)
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

    showDialog(rgk) {
      this.floatingDialogVisible = true
      this.floatingDialogRgroup = Number(rgk)
      for (let pzk of this.gameStore.regionGroups[rgk]) {
        this.floatingDialogWkld = this.gameStore.plantzones[pzk].peg.time
        break
      }
    },

    fileExport() {
      var a = document.createElement("a")
      let out = { 
        regionModifiers: this.userStore.regionModifiers,
        regionModifiers2: this.userStore.regionModifiers2,
      } 
      const str = JSON.stringify(out)
      var file = new Blob([str], {type: 'text/plain'});
      a.href = URL.createObjectURL(file);
      a.download = 'modifiers.json';
      a.click();
    },

    clear() {
      this.userStore.regionModifiers = {}
      this.userStore.regionModifiers2 = {}
    },

    setAllFloating(val) {
      const newDict = {}
      for (const rgk of Object.keys(this.gameStore.regionGroups)) {
        newDict[rgk] = val
      }
      // this is successfully tracked by standard (shallow) reactivity
      this.userStore.useFloatingModifiers = newDict
    },


  },
}
</script>

<template>
  <ModalDialog v-model:show="importDialogVisible">
    <form @submit.prevent="fileImport($event)">
      <input type="file" accept=".json" @click="fileImport()" />
      <button>import</button>
    </form>
  </ModalDialog>

  <ModalDialog v-model:show="floatingDialogVisible">
    <FloatingModifierEdit 
      :rgk="floatingDialogRgroup"
      :wspd="floatingDialogWspd"
      :workload="floatingDialogWkld"
      v-model:show="floatingDialogVisible"
    /><br/>
    Test on node:
    <select v-model="floatingDialogWkld">
      <option 
        v-for="pzk in gameStore.regionGroups[floatingDialogRgroup]" 
        :value="gameStore.plantzones[pzk] && gameStore.plantzones[pzk].peg.time"
      >
        {{ gameStore.plantzoneName(pzk) }} - {{ gameStore.plantzones[pzk] && gameStore.plantzones[pzk].peg.time }} base
      </option>
    </select>
    <br/>
    With workspeed:
    <input 
      type="range" 
      class="vmid"
      v-model.number="floatingDialogWspd" 
      min="40" 
      max="200" 
      step="0.01"
    >
    {{ floatingDialogWspd }}
  </ModalDialog>

  <div id="toptext">
    <p>Productivity modifiers are shown ingame as green bars at world map > resource view.
      Some green bars are hidden though, for those you can see the current worload in ingame worker assignment panel and calculate the modifier off that.</p>
    <p>Low modifier means lots of players are working in the area and workloads are increased (up to 2x of base).</p>
    <p>If unspecified, 0% modifier will be used (= max workload = longest cycle = min cycles per day = min profit)</p>
    
    <details>
      <summary>Advanced</summary>
      <button @click="importDialogVisible = true">import</button>
      <button @click="fileExport()">export</button>
      <button @click="clear()">clear</button>
      <label>
        <input type="checkbox" v-model="userStore.allowFloating">allow floating modifiers
      </label>
      <span v-if="userStore.allowFloating">
        <button @click="setAllFloating(true)">all floating</button>
        <button @click="setAllFloating(false)">all constant</button>
      </span>
    </details>
  </div>

  <table>
    <tr>
      <th>#</th>
      <th>Modifier%</th>
      <th>Contains nodes</th>
    </tr>

    <tr v-for="plantzones, rgk in gameStore.regionGroups">
      <td class="center">
        {{ rgk }}
      </td>

      <td class="center">
        <template v-if="userStore.allowFloating">
          <label class="switch mauto">
            <input type="checkbox" v-model="userStore.useFloatingModifiers[rgk]">
            <span class="slider"></span>
          </label>
        </template>
        <template v-if="userStore.allowFloating && userStore.useFloatingModifiers[rgk]">
          floating<br/>
          ~{{ formatFixed(userStore.medianModifiers[rgk], 2) }}
          <button @click="showDialog(rgk)">edit</button>
        </template>
        <template v-else>
          constant<br/>
          <input type="number" v-model.number="userStore.regionModifiers[rgk]" min="0" max="100" step="0.01" class="w42em">
        </template>
      </td>

      <td>
        <div v-for="pzk in plantzones">
          <RouterLink tag="a" :to="{path: './', hash: '#node' + pzk}">
            {{ gameStore.plantzoneName(pzk) }}
          </RouterLink>
          {{ gameStore.ready && gameStore.plantzones[pzk].peg.time }}

          <template v-if="userStore.allowFloating && userStore.useFloatingModifiers[rgk]">
            ⤳ {{ formatFixed(userStore.medianWorkloads[pzk], 2) }}
          </template>
          <template v-else>
            → {{ gameStore.ready ? formatFixed(gameStore.plantzones[pzk].activeWorkload, 2) : "" }}
          </template>
        </div>
      </td>

    </tr>
  </table>

</template>

<style scoped>

[type="checkbox"]
{
  vertical-align: middle;
}
.hmid {
  text-align: center;
}
.mauto {
  margin-left: auto;
  margin-right: auto;
}

/* slider */

.switch {
  position: relative;
  display: block;
  width: 30px;
  height: 17px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  -webkit-transition: .4s;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 13px;
  width: 13px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  -webkit-transition: .4s;
  transition: .4s;
}

input:checked + .slider {
  background-color: hsla(160, 100%, 37%, 1);
}

input:focus + .slider {
  box-shadow: 0 0 1px hsla(160, 100%, 37%, 1);
}

input:checked + .slider:before {
  -webkit-transform: translateX(13px);
  -ms-transform: translateX(13px);
  transform: translateX(13px);
}

</style>
