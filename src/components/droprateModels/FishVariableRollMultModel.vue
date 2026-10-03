<script>
import FishVariableRollSumModel from './FishVariableRollSumModel.vue'

export default {
  components: { FishVariableRollSumModel },
  emits: ['distribution-change'],
  props: {
    stats: Object,
    histogram: Object,
    avg_size: Number,
    mode_relative: Boolean,
  },
}
</script>

<template>
  <FishVariableRollSumModel
    v-bind="$props"
    multiply
    @distribution-change="$emit('distribution-change', $event)"
  />
</template>
