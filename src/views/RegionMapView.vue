<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {Deck, OrthographicView, COORDINATE_SYSTEM} from '@deck.gl/core';
import {BitmapLayer, SolidPolygonLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';
import {ContourLayer} from '@deck.gl/aggregation-layers';

export default {
  setup() {
    const gameStore = useGameStore()
    const userStore = useUserStore()
    return { gameStore, userStore }
  },

  components: {
    
  },

  data() {
    return {
      deck: null,
      tileLayer: null,
      contourLayer: null,
      polygonLayer: null,
      initialViewState: {
        target: [0, 0],
        zoom: -12,
        minZoom: -12,
        maxZoom: -5,
        //transitionDuration: 1000,
        //transitionInterpolator: new MyInterpolator(1000)
      },
      hoverx: 0,
      hovery: 0,
      selectedZone: 0,
    }
  },

  computed: {

  },

  mounted() {
    this.deck = this.initializeDeck()
  },

  methods: {
    initializeDeck() {
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

      this.polygonLayer = new SolidPolygonLayer({
        id: 'SolidPolygonLayer',
        // [{"zipcode":94107,"population":26599,"area":6.11,"contour":[[-122.4011597,37.7820243],[-122.3967052,37.7855421],
        
        //data: 'data/poly_simple.json',
        //data: 'data/poly_2024-06.json',
        //data: 'data/poly_2025-01.json',
        data: 'data/poly_2025-01_rg.json',
        //data: 'data/fish.json',
        
        /* props from SolidPolygonLayer class */
        
        //elevationScale: 1,
        //extruded: true,
        filled: true,
        //getElevation: d => d.population / d.area / 10,
        getFillColor: d => [...d.c],
        //getLineColor: [80, 80, 80],
        getPolygon: d => d.p,
        //material: true,
        //wireframe: true,
        
        /* props inherited from Layer class */
        
        autoHighlight: true,
        // coordinateOrigin: [0, 0, 0],
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        //highlightColor: [0, 0, 128, 128],
        modelMatrix: [
          301.1765,        0, 0, 0,
                 0, 301.1765, 0, 0,
                 0,        0, 1, 0,
          -2048000, -2048000, 0, 1

              /*3000,        0, 0, 0,
                 0,     3000, 0, 0,
                 0,        0, 1, 0,
                 0,        0, 0, 1*/
        ],
        opacity: 0.1,
        pickable: true,
        // visible: true,
        // wrapLongitude: false,

        /*onClick: (info, event) => {
          if (info.object) {
            console.log(info.object)
            this.selectedZone = info.object.ci
          }
        },*/
      })
      
      


      const deckInstance = new Deck({
        canvas: 'deck-canvas',
        mapbox: false,
        //getTooltip: ({object}) => object && `#${object.key} ${this.gameStore.nodeName(object.key)} \n this node ${object.thisCpCost}CP \n from town ${object.fromTownCpCost}CP \n path ${object.fromTownPath}`,
        //getTooltip: this.objectTooltip,
        //onViewStateChange: this.onMoveEvent,  // saves to mapStore

        initialViewState: this.initialViewState,
        
        layers: [
          this.tileLayer,
          //this.contourLayer,
          this.polygonLayer,
        ],

        controller: {doubleClickZoom: false},
        getTooltip: ({object}) => object && `i${object.i} ci${object.ci} `,

        views: [
          new OrthographicView({
            controller: true,
          }),
        ],

        onHover: (info, event) => {
          if (info.coordinate) {
            //console.log(info.coordinate)
            this.hoverx = Math.round(info.coordinate[0])
            this.hovery = Math.round(info.coordinate[1])
          }
        },

        /*onClick: ({x, y}) => {
          const pickInfo = deckInstance.pickObject({x, y});
          console.log(pickInfo);
        },*/
      });

      return deckInstance
    },
  }
}
</script>

<template>
  
  <main>
    <div id="canvas-limiter">
      <canvas id="deck-canvas" ref="canvas"></canvas>
      
      <div id="coords">
        x: {{ hoverx }} y: {{ hovery }}
      </div>
      
    </div>
</main>

</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  height: 98%;
  overflow: hidden;
}
#canvas-limiter {
  height: 100%;
  width: 100%;
}
#deck-canvas {
  height: 50%;
}
#coords {
  position: absolute;
  bottom: 0;
}
#topright {
  float: right;
}
</style>