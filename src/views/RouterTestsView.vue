<script>
import { useGameStore } from '../stores/game'


export default {
  setup() {
    const gameStore = useGameStore()
    return { gameStore }
  },

  components: {
    
  },

  data() {
    return {
      all_origins: [],
      all_destinations: [],

      predefined_cases: [
        {
          'label': 'ehwaz-pinto',
          'expected': 5,  // now 6
          'pairs': [[160, 1], [136, 1]],
        },
        {
          'label': 'glish-lynch_f/heidel-glish_r',
          'expected': 9,  // now 10
          'pairs': [[488, 302], [480, 301]],
        },
      ],
      predefined_results: [],

      rtp_pair_count: 10,
      rtp_results: [],

      real_pair_count: 10,
      real_max_distance: 10,
      real_results: [],

      retry_until_red: false,
      green_retries: 0,
      max_ms: 5000,
    }
  },

  async mounted() {
    function until(conditionFunction) {
      const poll = resolve => {
        if (conditionFunction()) resolve();
        else setTimeout(_ => poll(resolve), 100);
      }
      return new Promise(poll);
    }

    console.log('mounted, sleeping')
    await until(_ => this.gameStore.ready == true)
    console.log('resuming')

    const gameStore = useGameStore()
    this.all_origins = gameStore.townsWithLodging
    this.all_destinations = []
    for (const nk of Object.keys(gameStore.plantzones)) {
      this.all_destinations.push(Number(nk))
    }
  },

  computed: {
    
  },

  methods: {
    run_case(testcase) {
      const gameStore = useGameStore()
      const routees = []
      for (const pair of testcase.pairs) {
        routees.push({source: pair[0], target: pair[1]})
      }

      //console.log('running', testcase)
      const resultOld = gameStore.routeOld([], routees)
      const resultWasm = gameStore.routeWasm([], routees)

      testcase.str = ""
      for (const pair of testcase.pairs) {
        testcase.str += `${pair[1]},${pair[0]} `
      }

      const ret = { 
        testcase,
        resultOld,
        resultWasm,
        red: resultWasm.totalCost > resultOld.totalCost
      }
      return ret
    },

    run_predefined() {
      this.predefined_results.length = 0
      for (const tc of this.predefined_cases) {
        this.predefined_results.push(this.run_case(tc))
      }
    },

    run_rtp() {
      const start = Date.now()
      this.green_retries = 0
      while (1) {
        const badNodes = new Set()
        const testcase = {
          'label': `rtp${this.rtp_results.length}`,
          'pairs': [],
        }
        for (let i = 0; i < this.rtp_pair_count; i++) {
          const source = this.all_origins[Math.floor(Math.random() * this.all_origins.length)]
          const goodNodes = this.all_destinations.filter(n => !badNodes.has(n)) 
          const target = goodNodes[Math.floor(Math.random() * goodNodes.length)]
          badNodes.add(target)
          testcase.pairs.push([source, target])
        }
        const result = this.run_case(testcase)
        if (this.retry_until_red && !result.red) this.green_retries++
        if (!this.retry_until_red || result.red || Date.now()-start > this.max_ms) {
          this.rtp_results.push(result)
          break
        }
      }
    },

    run_real() {
      const gameStore = useGameStore()
      const start = Date.now()
      this.green_retries = 0

      while (1) {
        const badNodes = new Set()
        const testcase = {
          'label': `real${this.real_results.length}`,
          'pairs': [],
        }
        for (let i = 0; i < this.real_pair_count; i++) {
          // random town
          const goodTowns = this.all_origins.filter(n => !badNodes.has(n))
          if (goodTowns.length == 0) break;
          const source = goodTowns[Math.floor(Math.random() * goodTowns.length)]
          // random walk around town
          let target = source
          for (let dist = 0; dist < this.real_max_distance; dist++) {
            const links = gameStore.links[target]
            const goodLinks = links.filter(n => !badNodes.has(n))
            target = goodLinks[Math.floor(Math.random() * goodLinks.length)]
            // one more step if didn't move at all
            if (target == source) dist--
          }
          if (target == undefined) {
            i -= 1
            continue
          }
          badNodes.add(target)
          testcase.pairs.push([source, target])
        }
        const result = this.run_case(testcase)
        if (this.retry_until_red && !result.red) this.green_retries++
        if (!this.retry_until_red || result.red || Date.now()-start > this.max_ms) {
          this.real_results.push(result)
          break
        }

      }
    },
  }
}
</script>

<template>
  <main>
    
    <input type="checkbox" v-model="retry_until_red"> retry until first fail 
    up to <input type="number" class="w5em" v-model.number="max_ms">ms
    <template v-if="retry_until_red">
      ({{ green_retries }}✔️ ignored)
    </template>

    <div class="column-container">
      <div class="column" v-if="0">
        <h3>Predefined testcases</h3>
        <button @click="run_predefined">run</button>
        <table>
          <thead>
            <tr>
              <td>old</td>
              <td>wasm</td>
              <td>≥</td>
              <td>label</td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in predefined_results">
              <td>
                {{ r.resultOld.totalCost }}
              </td>
              <td>
                {{ r.resultWasm.totalCost }}
              </td>
              <td>
                {{ r.red ? '❌' : '✔️' }} 
              </td>
              <td>
                <details>
                  <summary>{{ r.testcase.label }}</summary>
                  <pre>{{ r.testcase.str }}</pre>
                </details>
              </td>
            </tr>
          </tbody>
          
        </table>
      </div>

      <div class="column">
        <h3>
          Random town-plantzone pairs
          <abbr class="tooltip" title="completely random, including on the other side of the map">ℹ</abbr>
        </h3>
        Pairs <input 
          type="range"
          v-model.number="rtp_pair_count" 
          min="1"
          max="80"
        > {{ rtp_pair_count }}<br/>
        <button @click="run_rtp">run</button>
        <table>
          <thead>
            <tr>
              <td>old</td>
              <td>wasm</td>
              <td>≥</td>
              <td>label</td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rtp_results">
              <td>
                {{ r.resultOld.totalCost }}
              </td>
              <td>
                {{ r.resultWasm.totalCost }}
              </td>
              <td>
                {{ r.red ? '❌' : '✔️' }} 
              </td>
              <td>
                <details>
                  <summary>{{ r.testcase.label }}</summary>
                  <pre>{{ r.testcase.str }}</pre>
                </details>
              </td>
            </tr>
          </tbody>
          
        </table>
      </div>

      <div class="column">
        <h3>
          Realistic
          <abbr class="tooltip" title="plantzones tend to be near hometowns (~sqrt of steps)">ℹ</abbr>
        </h3>
        Pairs <input 
          type="range"
          v-model.number="real_pair_count" 
          min="1"
          max="80"
        > {{ real_pair_count }}<br/>
        Steps <input 
          type="range"
          v-model.number="real_max_distance" 
          min="1"
          max="80"
        > {{ real_max_distance }}<br/>
        <button @click="run_real">run</button>
        <table>
          <thead>
            <tr>
              <td>old</td>
              <td>wasm</td>
              <td>≥</td>
              <td>label</td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in real_results">
              <td>
                {{ r.resultOld.totalCost }}
              </td>
              <td>
                {{ r.resultWasm.totalCost }}
              </td>
              <td>
                {{ r.red ? '❌' : '✔️' }} 
              </td>
              <td>
                <details>
                  <summary>{{ r.testcase.label }}</summary>
                  <pre>{{ r.testcase.str }}</pre>
                </details>
              </td>
            </tr>
          </tbody>
          
        </table>
      </div>

    </div>
  </main>
</template>

<style scoped>
.column-container {
  display: flex;
}

.column {
  height: 100%;
  overflow-y: auto;
  padding: 5px;
  width: auto;

  padding-left: 1em;
}

.tooltip {
  cursor: help;
}
</style>