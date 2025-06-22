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
    <input type="range" v-model="me.center" class="vmid" :min="0" :max="2" :step="0.01"> c={{ me.center }} 
  </td>
  <td>
    <input type="range" v-model="me.width" class="vmid" :min="0" :max="2" :step="0.01"> w={{ me.width }}      
  </td>
</template>

<style scoped>

</style>
