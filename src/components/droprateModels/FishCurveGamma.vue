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
    <input type="range" v-model="me.alpha"  class="vmid" :min="5" :max="10" :step="0.01"> α={{ me.alpha }} 
  </td>
  <td>
    <input type="range" v-model="me.theta"  class="vmid" :min="0.1" :max="0.2" :step="0.001"> θ={{ me.theta }}
  </td> 
</template>

<style scoped>

</style>
