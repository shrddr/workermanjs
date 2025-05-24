<script>
import {useGameStore} from '../stores/game'
import {useUserStore} from '../stores/user'
import {Deck, OrthographicView, COORDINATE_SYSTEM} from '@deck.gl/core';
import {BitmapLayer, GeoJsonLayer, IconLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';

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
      geoLayer: null,
      iconLayer: null,
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
      highlightedIcon: 0,
    }
  },

  computed: {

  },

  mounted() {
    this.deck = this.initializeDeck()
  },

  watch: {
    highlightedIcon(newVal) {
      //console.log('highlightedIcon ->', newVal)
      this.iconLayer = this.makeIconsLayer()
      this.deck.setProps({
        layers: [
          this.tileLayer,
          this.geoLayer,
          this.iconLayer,
        ]
      })
    },
  },

  methods: {
    makeIconsLayer() {
      return new IconLayer({
        data: 'data/deck_rg_graphs.json',
        getPosition: d => [d.graphx, d.graphz],
        getColor: d => [66, 66, 66, 255],  // r, g, b have no effect, only alpha does
        getIcon: function(d) {
          return {
            url: 'data/icons/target_percent.png',
            width: 128,
            height: 128,
            anchorX: 64,
            anchorY: 64,
          }
        },
        modelMatrix: [
          1, 0, 0, 0,
          0, -1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ],
        getSize: d => d.k == this.highlightedIcon ? 50 : 0,
        //autoHighlight: true,
        //pickable: true,
        updateTriggers: {
          getSize: this.highlightedIcon, // accessor does not re-run by default
        }
      })
    },

    makeGeoLayer() {
      return new GeoJsonLayer({
        id: 'GeoJsonLayerCur',
        data: 'data/rg_2025-05_1_5.geojson',

        stroked: false,  // default: true
        getLineWidth: 50,  
        //lineWidthUnits: 'pixels',  // default: meters
        lineWidthMinPixels: 1,
        getLineColor: [255, 255, 255],
        //filled: false,
        getFillColor: f => f.properties.c,
        //pointType: 'circle+text',
        pickable: true,
        //getPointRadius: 4,
        //getText: f => f.properties.c,
        //getTextSize: 12,

        /* props inherited from Layer class */

        autoHighlight: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        //highlightColor: [0, 0, 128, 128],
        modelMatrix: [
          301.1765,        0, 0, 0,
                 0, 301.1765, 0, 0,
                 0,        0, 1, 0,
          -2048000, -2048000, 0, 1
        ],
        opacity: 0.1,
        // visible: true,
        // wrapLongitude: false,

        onHover: ({object}) => {
          if (object && object.properties) {
            this.highlightedIcon = object.properties.rg
          }
        },
      })
    },

    initializeDeck() {
      this.tileLayer = new TileLayer({
        id: 'TileLayer',
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

      this.iconLayer = this.makeIconsLayer()
      this.geoLayer = this.makeGeoLayer()

      const deckInstance = new Deck({
        canvas: 'deck-canvas',
        mapbox: false,
        //getTooltip: ({object}) => object && `#${object.key} ${this.gameStore.nodeName(object.key)} \n this node ${object.thisCpCost}CP \n from town ${object.fromTownCpCost}CP \n path ${object.fromTownPath}`,
        //getTooltip: this.objectTooltip,
        //onViewStateChange: this.onMoveEvent,  // saves to mapStore

        initialViewState: this.initialViewState,

        layers: [
          this.tileLayer,
          this.geoLayer,
          this.iconLayer,
        ],

        controller: {doubleClickZoom: false},
        getTooltip: ({object}) => {
          if (object && object.properties) {
            if (object.properties.rg) {
              let ret = `RG${object.properties.rg}`
              //const member_indices = object.properties.rs
              //for (const ri of member_indices) {
              //  ret += `\n${this.gameStore.uloc.town[ri]}`
              //}
              return ret
            }
          }
        },

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
        x: {{ hoverx }} y: {{ -hovery }}
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