<script>
import { formatFixed, formatKMG, isGoodVal } from '../../util.js'
import FishCurveNormal from './FishCurveNormal.vue'
import FishCurveUniform from './FishCurveUniform.vue'
import FishCurveTriangular from './FishCurveTriangular.vue'
import FishCurveGamma from './FishCurveGamma.vue'
import FishCurveLognormal from './FishCurveLognormal.vue'

export default {
  data: () => ({

  }),
  props: {
    me: Object,
    isLast: Boolean,
  },
  emits: [
    'delete'
  ],
  components: {
    FishCurveNormal,
    FishCurveLognormal,
    FishCurveUniform,
    FishCurveTriangular,
    FishCurveGamma,
  },
  methods: {
    formatFixed,

    morph(event) {
      const oldKind = this.me.kind
      const newKind = event.target.value
      let c = 0
      let s = 0
      switch (oldKind) {
        case 'Normal':
          c = this.me.mean
          s = this.me.sigma
          break
        case 'Triangular':
          c = this.me.center
          s = this.me.width/2
          break
        case 'Uniform':
          c = this.me.center
          s = this.me.width/2
          break
        case 'Gamma':
          c = this.me.alpha * this.me.theta
          s = Math.sqrt(this.me.alpha * this.me.theta * this.me.theta)
          break
        case 'Lognormal':
          c = this.me.mean
          s = this.me.sigma
          break
        default:
          throw Error(`unknown curve kind ${oldKind}`)
      }
      
      console.log(`${oldKind} -> ${newKind} (${c}, ${s})`)

      switch (newKind) {
        case 'Normal':
          this.me.mean = c
          this.me.sigma = s
          this.me.mean = Math.round(this.me.mean * 100) / 100
          this.me.sigma = Math.round(this.me.sigma * 100) / 100
          break
        case 'Triangular':
          this.me.center = c
          this.me.width = s*2
          this.me.center = Math.round(this.me.center * 100) / 100
          this.me.width = Math.round(this.me.width * 100) / 100
          break
        case 'Uniform':
          this.me.center = c
          this.me.width = s*2
          this.me.center = Math.round(this.me.center * 100) / 100
          this.me.width = Math.round(this.me.width * 100) / 100
          break
        case 'Gamma':
          this.me.alpha = 6.66 * c
          this.me.theta = c / this.me.alpha
          this.me.alpha = Math.round(this.me.alpha * 100) / 100
          this.me.theta = Math.round(this.me.theta * 1000) / 1000
          break
        case 'Lognormal':
          this.me.mean = c
          this.me.sigma = s
          this.me.mean = Math.round(this.me.mean * 100) / 100
          this.me.sigma = Math.round(this.me.sigma * 100) / 100
          break
        default:
          throw Error(`unknown curve kind ${newKind}`)
      }

      this.me.kind = newKind
    }
  },
  computed: {
    componentName() {
      return 'FishCurve' + this.me.kind
    },
  },
}

</script>

<template>
  
  <td>
    <input type="range" v-model="me.amount" :disabled="isLast" class="vmid" :min="0" :max="1" :step="0.01"> 
    {{ formatFixed(me.amount*100, 1) }}%
  </td>
  <td>
    <select :value="me.kind" @change="morph($event)">
      <option>Normal</option>
      <option>Triangular</option>
      <option>Uniform</option>
      <option>Gamma</option>
      <option>Lognormal</option>
    </select>
  </td>
  <component :is="componentName" v-model:me="me" />
  <td>
    <button @click="$emit('delete')">delete</button>
  </td>

</template>

<style scoped>

</style>
