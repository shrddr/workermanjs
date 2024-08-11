<script>
import { useGameStore } from '../stores/game'


export default {
  setup() {
    const gameStore = useGameStore()
    return { gameStore }
  },

  components: {
    
  },

  data() {
    return {
      cases: [
        {
          'label': 'ehwaz-pinto',
          'expected': 5,  // now 6
          'tasks': [[1, 160], [1, 136]],
        },
        {
          'label': 'glish-lynch_f/heidel-glish_r',
          'expected': 9,  // now 10
          'tasks': [[302, 488], [301, 480]],
        },
      ],
    }
  },

  computed: {
    run_all() {
      const ret = []
      for (const tc of this.cases) {
        ret.push(this.run_case(tc))
      }
      return ret
    },
  },

  methods: {
    run_case(tc) {
      const gameStore = useGameStore()
      const routees = []
      for (const task of tc.tasks) {
        routees.push({source: task[0], target: task[1]})
      }
      const routes = gameStore.route([], routees)
      const ret = { 
        ...tc,
        ...routes,
        passed: routes.totalCost == tc.expected
      }
      return ret
    },
  }
}
</script>

<template>
  <main>
    <div id="tests">
      <div v-for="r in run_all">
        {{ r.label }} {{ r.totalCost }} {{ r.passed ? '✔️' : '❌' }} 
        <button @click="">view</button>
      </div>
    </div>

    <div id="content">

      

    </div>
  </main>
</template>

<style scoped>

</style>