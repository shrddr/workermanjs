<script>
import {Deck, OrthographicView} from '@deck.gl/core';
import {BitmapLayer, LineLayer, IconLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';
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

      rtp_pair_count: 10,
      rtp_results: [],

      real_pair_count: 10,
      real_steps: 10,
      real_results: [],

      retry_until_red: false,
      green_retries: 0,
      max_ms: 5000,


      mapNodes: new Set(),

      deck: null,
      tileLayer: null,
      iconData: [],
      iconPositions: {},
      iconLayer: null,
      lineData: [],
      lineLayer: null,
      initialViewState: {
        target: [0, 0],
        zoom: -8,
        minZoom: -12,
        maxZoom: -5,
      },
      hoverInfo: null,
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

    this.iconData = await (await fetch(`data/deck_icons.json`)).json()
    this.iconPositions = await (await fetch(`data/deck_icon_positions.json`)).json()
    this.lineData = await (await fetch(`data/deck_links.json`)).json()

    this.deck = this.initializeDeck()
    this.updateDeck()
  },

  computed: {
    iconsCalc() {
      const ret = []
      const mapHideInactive = 1
      this.hiddenNodesCount = 0
      if (!this.iconData) return ret

      const highlighteds = []
      this.iconData.forEach(([key, kind]) => {
        if (key in this.gameStore.nodes) {
          const taken = this.mapNodes.has(key)
          if (mapHideInactive && !taken) {
            this.hiddenNodesCount += 1
            //return
          }
          const isHighlighted = false
          const newIcon = {
            key,
            kind,
            pos: this.iconPositions[key],
            taken,
            isHighlighted,
            thisCpCost: this.gameStore.ready ? this.gameStore.nodes[key].CP : 0,
          }

          ret.push({
            ...newIcon, 
            hidden: (mapHideInactive && !newIcon.taken) || isHighlighted
          })
        }
      })

      console.log('iconsCalc', this.hiddenNodesCount, 'hidden')
      return { normal: ret, highlighted: highlighteds}
    },

    linesCalc() {
      const colorInactive = [172,172,172,255]
      const colorWorker =   [255,179,  0,255]
      
      let ret = []
      this.lineData.forEach(([a, b]) => {
        let color = colorInactive
        if (this.mapNodes.has(a) && this.mapNodes.has(b)) {
          color = colorWorker
        }

        ret.push({
          start: this.iconPositions[a],
          end: this.iconPositions[b],
          color
        })
      })

      //console.log('linesCalc', ret)
      return ret
    },
  },

  methods: {
    run_case(testcase) {
      const gameStore = useGameStore()
      const routees = []
      for (const pair of testcase.pairs) {
        routees.push({type: 'worker', source: pair[0], target: pair[1]})
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
        red: resultWasm.autotakenNodesCP > resultOld.autotakenNodesCP
      }
      return ret
    },

    run_rtp() {
      const start = Date.now()
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
        if (this.retry_until_red && !result.red) {
          this.green_retries++
        }
        if (!this.retry_until_red || result.red || Date.now()-start > this.max_ms) {
          this.rtp_results.push(result)
          break
        }
      }
    },

    run_real() {
      const gameStore = useGameStore()
      const start = Date.now()

      while (1) {
        const badNodes = new Set()
        const testcase = {
          'label': `real${this.real_results.length}`,
          'pairs': [],
        }
        for (let i = 0; i < this.real_pair_count; i++) {
          // random town
          const goodTowns = this.all_origins.filter(n => !badNodes.has(n))
          if (goodTowns.length == 0) {
            // no more towns, try again from scratch (i=0)
            badNodes = new Set()
            testcase.pairs = []
            i = -1
          }
          const source = goodTowns[Math.floor(Math.random() * goodTowns.length)]
          // random walk around town
          let target = source
          for (let dist = 0; dist < this.real_steps; dist++) {
            if (!(target in gameStore.links)) throw Error(`${target} has no links?!`)
            const links = gameStore.links[target]
            const goodLinks = links.filter(n => !badNodes.has(n))
            if (goodLinks.length == 0) {
              // started in a town that is surrounded by badNodes, try again at same i
              break
            } else {
              const pos = Math.floor(Math.random() * goodLinks.length)
              target = goodLinks[pos]
              // one more step if walked back to source
              if (target == source) dist--
            }
          }
          badNodes.add(target)
          if (target == source) {
            i-- // try again at same i
          } else {
            testcase.pairs.push([source, target])
          }
        }

        const result = this.run_case(testcase)
        if (this.retry_until_red && !result.red) {
          this.green_retries++
        }
        if (!this.retry_until_red || result.red || Date.now()-start > this.max_ms) {
          this.real_results.push(result)
          break
        }

      }
    },


    makeIconsLayer() {
      // https://deck.gl/docs/api-reference/core/layer#updatetriggers
      return new IconLayer({
        data: this.iconsCalc.normal,
        onHover: info => this.hoverInfo = info,
        getPosition: d => d.pos,
        getColor: d => [66, 66, 66, d.hidden ? 0 : 255],  // r, g, b have no effect, only alpha does
        getIcon: function(d) {
          return {
            url: 'data/icons/node/' + (d.isHighlighted ? 'highlighted/' : '') + (d.taken ? '' : 'gray/') + `${d.kind}.png`,
            width: 256,
            height: 256,
            anchorX: 128,
            anchorY: 128,
          }
        },
        transitions: {
          getColor: 400,
        },
        modelMatrix: [
          1, 0, 0, 0,
          0, -1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ],
        getSize: d => 32 * (d.isHighlighted ? 1.66 : 1),
        autoHighlight: true,
        pickable: true,
      })
    },

    makeLineLayer() {
      return new LineLayer({
        data: this.linesCalc,
        getSourcePosition: d => d.start,
        getTargetPosition: d => d.end,
        getColor: d => d.color,
        modelMatrix: [
          1, 0, 0, 0,
          0, -1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ],
      })
    },

    initializeDeck() {
      console.log('initializeDeck')

      this.tileLayer = new TileLayer({
        data: 'https://shrddr.github.io/maptiles/{z}/{x}_{y}.webp',
        minZoom: 0,
        maxZoom: 7,
        tileSize: 256 * 12800,
        zoomOffset: 14,
        extent: [
          (-67 * 2) * 12800,
          (-71 * 2) * 12800,
          (58 * 2) * 12800,
          (35 * 2) * 12800
        ],
        renderSubLayers: props => {
          const {
            bbox: {left, bottom, right, top}
          } = props.tile;

          return new BitmapLayer(props, {
            data: null,
            image: props.data,
            bounds: [left, bottom, right, top]
          });
        }
      })
      this.lineLayer = this.makeLineLayer()
      this.iconLayer = this.makeIconsLayer()
      
      return new Deck({
        canvas: 'deck-canvas',
        mapbox: false,

        initialViewState: this.initialViewState,
        
        layers: [
          this.tileLayer,
          this.lineLayer,
          this.iconLayer,
        ],

        controller: {doubleClickZoom: false},

        views: [
          new OrthographicView({
            controller: true,
          }),
        ]
      });

    },

    updateDeck() {
      if (!this.deck)
        return
      console.log('updateDeck')
      this.lineLayer = this.makeLineLayer()
      this.iconLayer = this.makeIconsLayer()
      this.deck.setProps({
        layers: [
          this.tileLayer,
          this.lineLayer,
          this.iconLayer,
        ],
        initialViewState: this.initialViewState,
      })
    },

  }
}
</script>

<template>
  <main>
    <div id="content">
      <input type="checkbox" v-model="retry_until_red"> retry until first fail 
      up to <input type="number" class="w5em" v-model.number="max_ms">ms
      <template v-if="retry_until_red">
        ({{ green_retries }}✔️ ignored)
      </template>

      <div class="column-container">

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
                <td>details</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rtp_results">
                <td>
                  <button @click="mapNodes = r.resultOld.autotakenNodes; updateDeck()">{{ r.resultOld.autotakenNodesCP }}</button>
                </td>
                <td>
                  <button @click="mapNodes = new Set(r.resultWasm.autotakenNodes); updateDeck()">{{ r.resultWasm.autotakenNodesCP }}</button>
                </td>
                <td>
                  {{ r.red ? '❌' : '✔️' }} 
                </td>
                <td>
                  <details>
                    <summary>{{ r.testcase.label }}</summary>
                    <pre>{{ r.testcase.str }}</pre>
                    old {{ [...r.resultOld.autotakenNodes] }}<br/>
                    wasm {{ r.resultWasm.autotakenNodes }}
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
            v-model.number="real_steps" 
            min="1"
            max="80"
          > {{ real_steps }}<br/>
          <button @click="run_real">run</button>
          <table>
            <thead>
              <tr>
                <td>old</td>
                <td>wasm</td>
                <td>≥</td>
                <td>details</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in real_results">
                <td>
                  <button @click="mapNodes = r.resultOld.autotakenNodes; updateDeck()">{{ r.resultOld.autotakenNodesCP }}</button>
                </td>
                <td>
                  <button @click="mapNodes = new Set(r.resultWasm.autotakenNodes); updateDeck()">{{ r.resultWasm.autotakenNodesCP }}</button>
                </td>
                <td>
                  {{ r.red ? '❌' : '✔️' }} 
                </td>
                <td>
                  <details>
                    <summary>{{ r.testcase.label }}</summary>
                    <pre>{{ r.testcase.str }}</pre>
                    old {{ [...r.resultOld.autotakenNodes] }}
                    wasm {{ r.resultWasm.autotakenNodes }}
                  </details>
                </td>
              </tr>
            </tbody>
            
          </table>
        </div>

      </div>
    </div>

    <div id="map">
      <canvas id="deck-canvas" ref="canvas"></canvas>
      <div v-if="hoverInfo && hoverInfo.object" id="tooltip" :style="{left:hoverInfo.x+'px', top:hoverInfo.y+'px'}">
        {{ hoverInfo.object.key }} {{ gameStore.uloc.node[hoverInfo.object.key] }} {{ hoverInfo.object.thisCpCost }}CP
      </div>
    </div>

  </main>
</template>

<style scoped>


main {
  height: 96%;
  display: grid;
  grid-template-rows: 1fr 50vh;
}

#content {
  overflow-y: auto;
}

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

#map {
  bottom: 0;
  left: 0;
  width: 100%;
  background-color: var(--color-background);  
  height: 50vh;
}

#tooltip {
  z-index: 1;
  position: absolute;
  pointer-events: none;
  color: rgb(160, 167, 180);
  background-color: rgb(41, 50, 60);
  padding: 10px;
}
</style>