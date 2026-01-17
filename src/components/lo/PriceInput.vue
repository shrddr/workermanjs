<script>
export default {
  name: 'PriceInput',

  props: {
    modelValue: Number
  },

  emits: ['update:modelValue'],

  data() {
    return {
      lastValue: null
    }
  },

  computed: {
    currentStep() {
      return this.getStep(this.modelValue)
    }
  },

  methods: {
    getStep(v) {
      if (v <= 499) return 1
      if (v <= 999) return 5
      if (v <= 4999) return 10
      if (v <= 9999) return 50
      if (v <= 49999) return 100
      if (v <= 99999) return 500
      if (v <= 499999) return 1000
      if (v <= 999999) return 5000
      if (v <= 4999999) return 10000
      if (v <= 9999999) return 50000
      if (v <= 49999999) return 100000
      if (v <= 99999999) return 500000
      if (v <= 499999999) return 1000000
      if (v <= 999999999) return 5000000
      if (v <= 4999999999) return 10000000
      if (v <= 9999999999) return 50000000
      if (v <= 49999999999) return 100000000
      if (v <= 99999999999) return 500000000
      if (v <= 499999999999) return 1000000000
      if (v <= 999999999999) return 5000000000
      if (v <= 4999999999999) return 10000000000
      if (v <= 9999999999999) return 50000000000
      return 100000000000
    },

    emitValue(v) {
      if (!Number.isNaN(v)) {
        this.$emit('update:modelValue', v)
      }
    },

    onInput(e) {
      const next = Number(e.target.value)

      // ensure stepping down from 1000 yields 995
      if (next === this.modelValue - e.target.step) {
        const prevstep = this.getStep(next)
        if (prevstep < e.target.step) {
          //console.log(`onInput`, this.modelValue, next, prevstep, e.target.step)
          const adjNext = this.modelValue - prevstep
          this.emitValue(adjNext)
          return
        }
      }

      // Manual typing
      this.emitValue(next)
    },
  }
}
</script>

<template>
  <input
    ref="input"
    type="number"
    :step="currentStep"
    :value="modelValue"
    @input="onInput"
    class="w5em tar"
  />
</template>