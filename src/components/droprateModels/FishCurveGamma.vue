<script>

export default {
  data: () => ({

  }),
  props: {
    me: Object,
  },
  components: {

  },
  methods: {
    
  },
  computed: {
    
  },
}

</script>

<template>
  <td>
    <input type="range" v-model="me.at"  class="vmid" :min="0.1" :max="2" :step="0.01"> αθ={{ me.at }} 
  </td>
  <td>
    <input type="range" v-model="me.theta"  class="vmid" :min="0.01" :max="0.3" :step="0.001"> θ={{ me.theta }}
  </td> 
</template>

<style scoped>

</style>
