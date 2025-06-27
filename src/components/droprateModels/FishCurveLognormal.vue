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
    <input type="range" v-model="me.emu"  class="vmid" :min="0.1" :max="2" :step="0.01"> e<sup>μ</sup>={{ me.emu }} 
  </td>
  <td>
    <input type="range" v-model="me.sigma"  class="vmid" :min="0.1" :max="0.7" :step="0.01"> σ={{ me.sigma }}
  </td> 
</template>

<style scoped>

</style>
