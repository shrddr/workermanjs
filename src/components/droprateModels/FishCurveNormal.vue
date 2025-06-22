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
    <input type="range" v-model="me.mean"  class="vmid" :min="0" :max="2" :step="0.01"> μ={{ me.mean }} 
  </td>
  <td>
    <input type="range" v-model="me.sigma"  class="vmid" :min="0" :max="0.7" :step="0.01"> σ={{ me.sigma }}
  </td> 
</template>

<style scoped>

</style>
