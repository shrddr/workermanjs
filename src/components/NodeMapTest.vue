<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {useMarketStore} from '../stores/market'
import {useMapStore} from '../stores/map'
import {Deck, OrthographicView, LinearInterpolator} from '@deck.gl/core';
import {BitmapLayer, LineLayer, IconLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';
import Heap from 'heap';
import {makeIconImg, formatFixed} from '../util.js'


export default {
  setup() {

  },

  props: {

  },

  data: () => ({
    deck: null,
    tileLayer: null,
    initialViewState: {
      target: [0, 0],
      zoom: -8,
      minZoom: -12,
      maxZoom: -5,
    },
  }),

  created() {
    
  },

  async mounted() {
    this.deck = this.initializeDeck()
    this.updateDeck()
  },

  watch: {

  },

  computed: {
    
  },

  methods: {
    makeIconImg,
    formatFixed,

    initializeDeck() {
      console.log('initializeDeck', this.initialViewState)

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
      
      return new Deck({
        canvas: 'deck-canvas',
        mapbox: false,

        initialViewState: this.initialViewState,
        
        layers: [
          this.tileLayer,
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
      this.deck.setProps({
        layers: [
          this.tileLayer,
        ],
        initialViewState: this.initialViewState,
      })
    },

    move(x) {
      //const ivsCopy = JSON.parse(JSON.stringify(localStored))
      this.initialViewState.target = [x, 0]
      //this.updateDeck()
      //console.log('trying to move to', x)
      //console.log(this.deck.viewState)
      this.deck.setProps({
        initialViewState: this.initialViewState
      });
    },

    moveDirect(x) {
      this.deck.setProps({
        initialViewState: {
          target:  [x, 0],
          zoom: -8,
          minZoom: -12,
          maxZoom: -5,
          transitionDuration: 100,
          transitionInterpolator: new LinearInterpolator({transitionProps: ['target', 'zoom']})
        }
      });
    },

  },
}
</script>


<template>
  via Data
  <button @click="move(10000)">10000</button>
  <button @click="move(-10000)">-10000</button>
  direct
  <button @click="moveDirect(10000)">10000</button>
  <button @click="moveDirect(-10000)">-10000</button>
  <div class="cw">
    <canvas id="deck-canvas" ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.cw {
  width: 600px;
  height: 300px;
}
</style>
