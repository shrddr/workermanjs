<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import {Deck, OrthographicView, LinearInterpolator, TransitionInterpolator} from '@deck.gl/core';
import {BitmapLayer, LineLayer, IconLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';
import Heap from 'heap';
import {makeIconImg, formatFixed} from '../util.js'
import { isNumber } from 'jstat-esm/lib/core/helpers';

function lerp(from, to, t) {
  return from + (to - from) * t;
}

class MyInterpolator extends TransitionInterpolator {
  constructor({speed = 100} = {}) {
    super({compare: ['x', 'y']});

    // units per second
    this.speed = speed;
  }

  getDuration(startViewState, endViewState) {
    console.log('startViewState', startViewState)
    const dx = Math.abs(startViewState.target[0] - endViewState.target[0]);
    const dy = Math.abs(startViewState.target[1] - endViewState.target[1]);
    return Math.sqrt(dx*dx, dy*dy) / this.speed * 1000;
  }

  initializeProps(startViewState, endViewState) {
    return {
      start: {x: startViewState.target[0], y: startViewState.target[1]},
      end: {x: endViewState.target[0], y: endViewState.target[1]}
    };
  }

  interpolateProps(start, end, t) {
    const x = lerp(start.x, end.x, t);
    const y = lerp(start.y, end.y, t);
    return {x, y};
  }
}

export default {
  setup() {
    // this is not early enough
    const gameStore = useGameStore()
    const userStore = useUserStore()
    const marketStore = useMarketStore()
    const mapStore = useMapStore()

    userStore.$subscribe((mutation, state) => {
      const start = Date.now()
      localStorage.setItem('user', JSON.stringify(state))
      console.log('userStore subscription took', Date.now()-start, 'ms')
    })

    mapStore.$subscribe((mutation, state) => {
      localStorage.setItem('map', JSON.stringify(state))
    })

    return { gameStore, userStore, marketStore, mapStore }
  },

  props: {
    clickedObj: Object,
    hoverInfo: Object,
    panToPzk: String,
    panPaPos: Object,
  },

  emits: [
    'update:hoverInfo',
    'update:clickedObj',
    'update:panToPzk',
    'update:panPaPos',
    'panAnywhere',
  ],

  data: () => ({
    deck: null,
    tileLayer: null,
    iconData: [],
    iconPositions: {},
    iconLayer: null,
    lineData: [],
    lineLayer: null,
    clickedObject: null,
    scores: {
      needTakes: {},
      pathCosts: {},
    },
    pzkSelectedTown: {},
    initialViewState: {
      target: [0, 0],
      zoom: -8,
      minZoom: -12,
      maxZoom: -5,
      //transitionDuration: 1000,
      //transitionInterpolator: new MyInterpolator(1000)
    },
    mapStateSavedTimestamp: 0,
    hiddenNodesCount: 0,
  }),

  created() {
    
  },

  async mounted() {
    function until(conditionFunction) {
      const poll = resolve => {
        if (conditionFunction()) resolve();
        else setTimeout(_ => poll(resolve), 100);
      }
      return new Promise(poll);
    }

    console.log('NodeMap mounted, sleeping')
    await until(_ => this.gameStore.ready == true && this.iconsCalc)
    console.log('resuming')

    this.iconData = await (await fetch(`data/deck_icons.json`)).json()
    this.iconPositions = await (await fetch(`data/deck_icon_positions.json`)).json()
    this.lineData = await (await fetch(`data/deck_links.json`)).json()
    
    if (this.panToPzk in this.gameStore.nodes) {
      console.log('panning to node', this.panToPzk)
      const p = this.gameStore.nodes[this.panToPzk].pos
      this.mapStore.target = [p.x, -p.z]
      this.mapStore.zoom = -7
      //this.panToPzk = null
    }
    this.initialViewState.target = [...this.mapStore.target]
    this.initialViewState.zoom = this.mapStore.zoom
    this.deck = this.initializeDeck()
    this.scores = this.dijkstraScoreAll()
    this.updateDeck()
  },

  watch: {
    'userStore.autotakenNodes'(newValue) {
      this.updateLayers()
    },
    'userStore.mapHideInactive'(newValue) {
      this.updateLayers()
    },
    'linesCalc'(newValue) {
      this.updateLayers()
    },
    'panPaPos'(newValue) {
      //console.log('panPaPos changed', newValue)
      if (newValue) {
        const ivsCopy = {...this.initialViewState}
        ivsCopy.target = [newValue.x, -newValue.z]
        ivsCopy.zoom = -7
        ivsCopy.transitionDuration = 100
        ivsCopy.transitionInterpolator = new LinearInterpolator({transitionProps: ['target', 'zoom']})
        this.deck.setProps({
          initialViewState: ivsCopy,
        })
      }
    },
  },

  computed: {
    iconsCalc() {
      let ret = []
      this.hiddenNodesCount = 0
      if (!this.iconData)
        return ret
      // Explicitly reference mapHideInactive to ensure reactivity
      //const { mapHideInactive, autotakenNodes } = this.userStore;
      this.iconData.forEach(([key, kind]) => {
        if (key in this.scores.pathCosts) {
          if (this.userStore.mapHideInactive && this.userStore.autotakenNodes.has(key) == false) {
            this.hiddenNodesCount += 1
            //return
          }
          ret.push({
            key,
            kind,
            pos: this.iconPositions[key],
            taken: this.userStore.autotakenNodes.has(key),
            thisCpCost: this.gameStore.nodes[key].CP,
            // not displayed:
            fromTown: this.scores.needTakes[key][0],
            fromTownCpCost: this.scores.pathCosts[key],
            fromTownPath: this.scores.needTakes[key],
          })
        }
      })
      console.log('iconsCalc', this.hiddenNodesCount, 'hidden')
      return ret
    },
    linesCalc() {
      let ret = []
      this.lineData.forEach(([a, b]) => {
        const active = this.userStore.autotakenNodes.has(a) && this.userStore.autotakenNodes.has(b)
        const grind = this.userStore.autotakenGrindNodes.has(a) && this.userStore.autotakenGrindNodes.has(b)
        ret.push({
          start: this.iconPositions[a],
          end: this.iconPositions[b],
          color: active ? (grind ? [255,109,0,255] : [255,179,0,255]) : [172,172,172,255]
        })
      })

      if (this.clickedObject) {
        if (this.clickedObject.key in this.userStore.pzJobs) {
          const job = this.userStore.pzJobs[this.clickedObject.key]
          let prev = undefined
          for (const nk of job.usedPath) {
            if (prev)
              ret.push({
                start: this.iconPositions[prev],
                end: this.iconPositions[nk],
                color: [64,255,0,255]
              })
            prev = nk
          }
        }
        if (this.gameStore.isLodgingTown(this.clickedObject.key)) {
          const tk = this.gameStore.tnk2tk(this.clickedObject.key)
          this.userStore.townWorkers(tk).forEach(w => {
            if (this.gameStore.jobIsPz(w.job)) {
              const job = this.userStore.pzJobs[w.job.pzk]

              let prev = undefined
              for (const nk of job.usedPath) {
                if (prev)
                  ret.push({
                    start: this.iconPositions[prev],
                    end: this.iconPositions[nk],
                    color: [64,255,0,255]
                  })
                prev = nk
              }
            }
            if (this.gameStore.jobIsWorkshop(w.job)) {
              // multiple workers can meet this criteria but we only need one
              const job = this.userStore.wsJobs.find(j => 
                j.worker.tnk == this.clickedObject.key &&
                j.hk == w.job.hk
              )
              
              let prev = undefined
              for (const nk of job.usedPath) {
                if (prev)
                  ret.push({
                    start: this.iconPositions[prev],
                    end: this.iconPositions[nk],
                    color: [64,255,128,255]
                  })
                prev = nk
              }
            }
          })
        }
      }
      //console.log('linesCalc', ret)
      return ret
    },
  },

  methods: {
    makeIconImg,
    formatFixed,

    onMoveEvent(e) {
      const now = Date.now()
      if (now - this.mapStateSavedTimestamp > 100) {
        this.mapStore.target = [...e.viewState.target]
        this.mapStateSavedTimestamp = now
      }
      // can't modify property in a component
      //this.panPaPos = null
      this.$emit('panAnywhere')
    },

    dijkstraScoreAll() {
      const ts = Date.now()

      const costs = this.gameStore.nodes
      const links = this.gameStore.links

      const start = 0
      links[start] = this.gameStore.townsWithHousing

      let unvisited = new Heap((a, b) => pathCosts[a] - pathCosts[b]);
      unvisited.push(start)
      let pathCosts = {[start]: 0}
      let needTakes = {[start]: []}
      
      var current
      while (unvisited.size()) {
        current = unvisited.pop()
        links[current].forEach(neighbor => {
          if (!(neighbor in costs)) {
            return
          }
          const newDistance = pathCosts[current] + costs[neighbor].CP
          if (neighbor in pathCosts) {
            // already met before, already in heap
            if (newDistance < pathCosts[neighbor]) {
              pathCosts[neighbor] = newDistance
              needTakes[neighbor] = [...needTakes[current], neighbor]
            }
          }
          else {
            unvisited.push(neighbor)
            pathCosts[neighbor] = newDistance
            needTakes[neighbor] = [...needTakes[current], neighbor]
          }
        })
      }

      console.log('scoreAll took', Date.now()-ts, 'ms')
      return { needTakes, pathCosts }
    },

    // not working because no reason to go through no-profit connection nodes
    dijkstraScoreAllProfitPerCp() {
      const ts = Date.now()

      const costs = this.gameStore.nodes
      const links = this.gameStore.links

      const start = 0
      links[start] = [1,301,302,601,61,602,604,608,1002,1101,1141,1301,1314,1319,1343,1380,1623,1649,1691,1750]

      let unvisited = new Set(Object.keys(costs))
      let needTakes = {0: []}
      let pathCosts = {0: 0}
      let metrics = {0: 0}
      for (const nk of Object.keys(costs)) {
        pathCosts[nk] = +Infinity
        metrics[nk] = 0
        needTakes[nk] = []
      }
      let current = start
      while (1) {
        links[current].forEach(neighbor => {
          const newDistance = pathCosts[current] + costs[neighbor].CP
          const profitData = this.gameStore.profitData(neighbor, needTakes[current][0], 150, 10, 10)
          const newMetric = newDistance == 0 ? 0 : -profitData.priceDaily / newDistance
          console.log(current, neighbor, newDistance, profitData.priceDaily, newMetric)
          if (newMetric < metrics[neighbor]) {
            pathCosts[neighbor] = newDistance
            metrics[neighbor] = newMetric
            needTakes[neighbor] = [...needTakes[current], neighbor]
          }
        })

        unvisited.delete(current)

        if (unvisited.length == 0)
          break
        let uTd = []
        unvisited.forEach(u => {
          uTd.push([u, pathCosts[u]])
        })
        uTd.sort((a,b)=>a[1]-b[1]) // asc
        let lowestTd = -1;
        //console.log('lowest', uTd[0]);
        ([current, lowestTd] = uTd[0])
        if (lowestTd == +Infinity)
          break
      }

      console.log('scoreAll took', Date.now()-ts, 'ms')
      return { needTakes, pathCosts }
    },

    makeIconsLayer() {
      // https://deck.gl/docs/api-reference/core/layer#updatetriggers
      return new IconLayer({
        data: this.iconsCalc,
        pickable: true,
        onClick: (info, event) => this.objectClicked(info.object),
        onHover: info => this.$emit('update:hoverInfo', info),
        getPosition: d => d.pos,
        getColor: d => (this.userStore.mapHideInactive && !d.taken) ? [0, 0, 0, 0] : [0, 0, 0, 255],
        getIcon: function(d) {
          return {
            url: d.taken ? `data/icons/node/${d.kind}.png` : `data/icons/node/gray/${d.kind}.png`,
            width: 256,
            height: 256,
            anchorX: 128,
            anchorY: 128,
          }
        },
        updateTriggers: {
          getColor: this.userStore.mapHideInactive  // doesn't work, using watch() instead
        },
        transitions: {
          getColor: 100,
        },
        modelMatrix: [
          1, 0, 0, 0,
          0, -1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ],
        getSize: 30,
        autoHighlight: true,
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
      console.log('initializeDeck', this.initialViewState)
      console.log('initializeDeck', this.mapStore.target)

      this.tileLayer = new TileLayer({
        data: 'data/maptiles/{z}/{x}_{y}.webp',
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
        //getTooltip: ({object}) => object && `#${object.key} ${this.gameStore.nodeName(object.key)} \n this node ${object.thisCpCost}CP \n from town ${object.fromTownCpCost}CP \n path ${object.fromTownPath}`,
        //getTooltip: this.objectTooltip,
        onViewStateChange: this.onMoveEvent,  // saves to mapStore

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

    updateLayers() {
      if (!this.deck)
        return
      console.log('updateLayers')
      this.lineLayer = this.makeLineLayer()
      this.iconLayer = this.makeIconsLayer()
      this.deck.setProps({
        layers: [
          this.tileLayer,
          this.lineLayer,
          this.iconLayer,
        ],
      })
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

    objectClicked(obj) {
      //console.log('this.clickedObject', this.clickedObject, 'this.clickedObj', this.clickedObj)
      this.clickedObject = obj
      this.$emit('update:clickedObj', obj)
      //this.updateDeck()
      
      //console.log('highlightLines', this.highlightLines)
      
      //console.log('Clicked:', obj)
      /*console.log(this.initialViewState)
      this.initialViewState.target = obj.pos
      console.log(this.initialViewState)
      this.updateDeck()*/
    },

    move(x) {
      this.initialViewState.target = [x, 0]
      console.log('trying to move to', x)
      console.log(this.deck.viewState)
    }

  },
}
</script>


<template>
  
  <canvas id="deck-canvas" ref="canvas"></canvas>
  <div id="hack">{{ iconsCalc.length }} icons</div>
  
  

  <div id="topcenter" v-if="userStore.mapHideInactive">
    {{ hiddenNodesCount }} inactive nodes hidden (<a href="#" @click="userStore.mapHideInactive = false">show</a>)
  </div>

  <!--<button @click="move(10000)">10000</button>
  <button @click="move(-10000)">-10000</button>-->

</template>

<style scoped>
#hack {
  position: absolute;
  left: -9999px;
}
#topcenter {
  position: absolute;
  top: 0;
  background-color: var(--color-background);
  padding: 0 5px 5px 5px;
  left: 50%;
  transform: translate(-50%, 0);
  overflow: auto;
}
</style>
