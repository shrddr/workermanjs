<script>

import {formatPrice, unformatPrice} from '../../util.js'

export default {
  name: 'AbbrevSpinner',

  props: {
    modelValue: {
      type: null,
      required: true
    }
  },

  emits: ['update:modelValue'],

  computed: {
    display() {
      return this.isEditing
        ? this.raw
        : this.formatPrice(this.modelValue)
    }
  },

  data() {
    return {
      isEditing: false,
      raw: ''
    }
  },

  methods: {
    formatPrice,
    unformatPrice,

    getStep(v) {
      // WorldMarketVariedPriceInfo
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

    onInput(e) {
      this.isEditing = true
      this.raw = e.target.value

      const parsed = this.unformatPrice(this.raw)
      this.$emit('update:modelValue', parsed)
    },

    format() {
      this.isEditing = false
    },

    // in reality, when the white price is above 5000, steps are 4940-4950-5000,
    // but when white price is below 5000, steps are 4980-4990-5000.
    // we inherit this quirk here by allowing 4950-up->5000-down->4990
    stepUp() {
      const step1 = this.getStep(this.modelValue)           // 4950 -> 10
      const ret1 = (Math.floor(this.modelValue / step1) + 1) * step1  // 4950 -> 4960
      /*const step2 = this.getStep(this.modelValue * 2)       // 9900 -> 50
      const ret2 = (Math.floor(this.modelValue / step2) + 1) * step2  // 4950 -> 5000
      const step3 = this.getStep(ret2)                      // 5000 -> 50
      if (step2 == step3) {
        this.$emit('update:modelValue', ret2)
        return
      }*/
      this.$emit('update:modelValue', ret1)
    },

    stepDown() {
      const step = this.getStep(this.modelValue)
      const ret = (Math.ceil(this.modelValue / step) - 1) * step
      this.$emit('update:modelValue', ret)
    },

    step(dir) {
      if (dir == 1) this.stepUp()
      if (dir == -1) this.stepDown()
    },

    startSpin(dir) {
      // Immediate step (native behavior)
      this.step(dir)

      // Initial delay (Chrome ~450ms)
      this.holdTimeout = setTimeout(() => {
        // Repeat rate (~70ms)
        this.holdInterval = setInterval(() => {
          this.step(dir)
        }, 70)
      }, 450)

      // Safety: stop on window blur
      window.addEventListener('mouseup', this.stopSpin, { once: true })
    },

    stopSpin() {
      clearTimeout(this.holdTimeout)
      clearInterval(this.holdInterval)
      this.holdTimeout = null
      this.holdInterval = null
    }
  },

  beforeUnmount() {
    this.stopSpin()
  }
}
</script>

<template>
  <div class="spin-input">
    <input
      type="text"
      :value="display"
      @input="onInput"
      @keydown.up.prevent="stepUp"
      @keydown.down.prevent="stepDown"
      @blur="format"
    />

    <div class="spin-buttons">
      <button
        aria-label="Increase"
        @mousedown.prevent="startSpin(1)"
        @mouseup="stopSpin"
        @mouseleave="stopSpin"
      ></button>

      <button
        aria-label="Decrease"
        @mousedown.prevent="startSpin(-1)"
        @mouseup="stopSpin"
        @mouseleave="stopSpin"
      ></button>
    </div>
  </div>
</template>

<style>
.spin-input {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid #444;
  overflow: hidden;
  background: var(--color-background-soft);
}

.spin-input input {
  border: none;
  padding: 1px 4px;
  width: 4em;
  outline: none;
}

.spin-buttons {
  display: flex;
  flex-direction: column;
}

.spin-buttons button {
  all: unset;
  width: 1em;
  height: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  user-select: none;
  background: var(--color-background-mute);
}

/* Triangle arrows using CSS */
.spin-buttons button::before {
  content: '';
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
}

.spin-buttons button:first-child::before {
  border-bottom: 5px solid var(--color-button);
}

.spin-buttons button:active:first-child::before {
  border-bottom: 5px solid var(--color-heading);
}

.spin-buttons button:last-child::before {
  border-top: 5px solid var(--color-button);
}

.spin-buttons button:active:last-child::before {
  border-top: 5px solid var(--color-heading);
}
</style>