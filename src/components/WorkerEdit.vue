<script>
import {useUserStore} from '../stores/user'
import {useGameStore} from '../stores/game'
import {makeIconSrc, formatFixed, randBetween, levelup} from '../util.js'
import FloatingModifierEdit from '../components/FloatingModifierEdit.vue'

export default {
  setup() {
    const userStore = useUserStore()
    const gameStore = useGameStore()

    return { gameStore, userStore }
  },

  components: {
    FloatingModifierEdit,
  },

  props: {
    workerEditing: Object,
    workerInitial: Object,
    show: {
      type: Boolean,
      default: false
    }
  },

  computed: {
    newProfit() {
      const ret = this.profit(this.workerEditing)
      //console.log('newProfit', this.workerEditing.job, ret)
      return this.profit(this.workerEditing)
    },
    initialProfit() {
      return this.profit(this.workerInitial)
    },
    currentWspdBonus() {
      var industry = 'farm'
      if (this.gameStore.jobIsWorkshop(this.workerEditing.job)) {
        const hk = this.workerEditing.job.hk
        industry = this.userStore.userWorkshops[hk].industry
      }
      const ret = this.gameStore.wspdBonus(this.workerEditing, industry)
      //console.log('cpt: currentWspdBonus', industry, ret)
      return ret
    },
    statRank() {
      return this.gameStore.workerStatRank(this.workerEditing)
    },
  },

  data: () => ({
    wasChanged: false,
    showChartPane: false,
    prerelease_charkind: true,
    prerelease_skillicon: false,
  }),

  watch: {
    workerEditing: {
      handler(newValue, oldValue) {
        this.wasChanged = JSON.stringify(newValue) !== JSON.stringify(this.workerInitial)
      },
      deep: true
    },
    workerInitial: {
      handler(newValue, oldValue) {
        this.wasChanged = JSON.stringify(newValue) !== JSON.stringify(this.workerEditing)
      },
      deep: true
    }
  },

  methods: {
    makeIconSrc,
    formatFixed,
    randBetween,
    levelup,
    
    spaceSep(millions, forceSign) {
      return formatFixed(millions * 1E6, 0, forceSign).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    },

    revert() {
      // piecewise to retain reactivity
      for (const [k, v] of Object.entries(this.workerInitial)) {
        if (typeof(v) == 'object')
          this.workerEditing[k] = JSON.parse(JSON.stringify(v))
        else
          this.workerEditing[k] = v
      }
    },

    profit(worker) {
      if (this.gameStore.jobIsPz(worker.job)) {
        const stats = this.gameStore.workerStatsOnPlantzone(worker)
        const profit = this.gameStore.profitPzTownStats(
          worker.job.pzk, worker.tnk, stats.wspd, stats.mspd, stats.luck, this.gameStore.isGiant(worker.charkey))
        return profit.priceDaily
      }
      if (this.gameStore.jobIsWorkshop(worker.job)) {
        const hk = worker.job.hk
        const workshop = this.userStore.userWorkshops[hk]
        const profit = this.gameStore.profitWorkshopWorker(hk, workshop, worker).priceDaily
        return profit
      }
    },

    maxSkillsAtLevel(level) {
      return 1 + Math.floor(level / 5)
    },

    suggestBestSkills(level, isPlantzone) {
      const maxSkills = this.maxSkillsAtLevel(level)

      const wBonuses = {0: {skills: []}}
      const wActions = ["wspd"]
      if (isPlantzone)
        wActions.push("wspd_farm")

      const wSkills = []
      for (const [key, skill] of Object.entries(this.gameStore.skillData)) {
        wActions.some(act => skill.hasOwnProperty(act) && wSkills.push({key, amount: skill[act], mspd: skill.hasOwnProperty("mspd") ? skill.mspd : 0}))
      }

      wSkills.sort(function (a, b) {
        if (b.amount != a.amount) return b.amount-a.amount
        // if wSkills delves into +2w territory, always lead with +2w+7m
        return b.mspd-a.mspd
      })

      for (let i = 1; i <= maxSkills; i++) {
        const tempSkills = wSkills.slice(0, i).map( ({key}) => (key) )
        const newProfit = this.profit({
          ...this.workerEditing,
          skills: tempSkills
        })
        wBonuses[i] = {skills: tempSkills, profit: newProfit}
        // if wSkills doesn't contain +2w+7m, try to replace the last one with +2w+7m
        // if doing doesn't increase profit, do nothing 
        // - it will be considered in mlSkill section
        if (tempSkills.every(sk => !this.gameStore.skillData[sk].hasOwnProperty("mspd"))) {
          const modSkills = [...tempSkills]
          const wmSkills = wSkills.filter(ss => ss.mspd > 0)
          if (wmSkills.length > 0) {
            modSkills[modSkills.length - 1] = wmSkills[0]
            const modProfit = this.profit({
              ...this.workerEditing,
              skills: modSkills
            })
            if (modProfit > newProfit) {
              wBonuses[i] = {skills: modSkills, profit: modProfit}
              console.log('using wmSkill')
            }
          }
        }
        //console.log(wBonuses[i])
      }
      console.log('wBonuses', wBonuses)
      
      // then mlSkills
      const mlActions = ["mspd", "luck"]

      const mlSkills = new Set()
      for (const [key, skill] of Object.entries(this.gameStore.skillData)) {
        const fits = mlActions.some(act => skill.hasOwnProperty(act))
        if (fits)
          mlSkills.add(key)
      }
      console.log('mlSkills', mlSkills)

      const stepResults = [wBonuses[maxSkills]]
      const mlBestSkills = []
      for (let i = 1; i <= maxSkills; i++) {
        // at each i, calculate profit of (i best mlSkills + 9-i wSkills) mix
        const stepBaseSkills = [...wBonuses[maxSkills-i].skills, ...mlBestSkills]
        const stepCandidates = []
        for (const sk of mlSkills) {
          if (wBonuses[maxSkills-i].skills.some(k => k==sk))
            continue
          const tempSkills = [...stepBaseSkills, sk]
          const newProfit = this.profit({...this.workerEditing, skills: tempSkills})
          stepCandidates.push({sk, profit: newProfit})
        }
        
        if (stepCandidates.length > 0) {
          stepCandidates.sort((a,b) => b.profit-a.profit)
          // best of wl candidates at i-th step
          const stepBestSkill = stepCandidates[0].sk
          const stepSkills = [...stepBaseSkills, stepBestSkill]
          stepResults[i] = {skills: stepSkills, profit: stepCandidates[0].profit}
          //console.log(i, 'ml', 9-i, 'w =', stepResults[i])
          mlBestSkills.push(stepBestSkill)
          mlSkills.delete(stepBestSkill)
        }
        else
          mlBestSkills.push(0)
      }

      stepResults.sort((a,b) => b.profit-a.profit)
      if (stepResults.length > 0) {
        const newSet = new Set(stepResults[0].skills)
        console.log(newSet)
        const ordered = new Array(newSet.size)
        for (let i = 0; i < maxSkills; i++) {
          const oldSkill = String(this.workerEditing.skills[i])
          if (newSet.has(oldSkill)) {
            ordered[i] = Number(oldSkill)
            newSet.delete(oldSkill)
          }
        }
        console.log(this.workerEditing.skills, newSet)
        const newList = [...newSet]
        for (let i = 0; i < maxSkills; i++) {
          if (ordered[i] == undefined) {
            ordered[i] = Number(newList.shift())
            document.querySelector("#skill"+i).classList.add("anim")
            setTimeout(() => {
              document.querySelector("#skill"+i).classList.remove("anim")
            }, 500)
          }
        }
        this.workerEditing.skills = ordered
      }
      else
        console.log('worker skills optimization failed')
    },

    recalcStats(newChar, newLevel) {
      if (this.workerEditing.level > 1) {
        const newLevelups = newLevel - 1
        //const newChar = event.target.value
        const stat_old = this.gameStore.workerStatic[this.workerEditing.charkey]
        const stat_new = this.gameStore.workerStatic[newChar]

        const wspd_up_old = (this.workerEditing.wspdSheet*1E6 - stat_old.wspd)
        const wspd_up_lo_new = stat_new.wspd_lo * newLevelups
        const wspd_up_hi_new = stat_new.wspd_hi * newLevelups
        const wspd_up_new = wspd_up_lo_new + (wspd_up_hi_new - wspd_up_lo_new) * this.statRank.wspd_rank

        const mspd_up_lo_new = stat_new.mspd_lo * newLevelups
        const mspd_up_hi_new = stat_new.mspd_hi * newLevelups
        const mspd_up_new = mspd_up_lo_new + (mspd_up_hi_new - mspd_up_lo_new) * this.statRank.mspd_rank
        
        const luck_up_old = (this.workerEditing.luckSheet*1E4 - stat_old.luck)
        const luck_up_lo_new = stat_new.luck_lo * newLevelups
        const luck_up_hi_new = stat_new.luck_hi * newLevelups
        const luck_up_new = luck_up_lo_new + (luck_up_hi_new - luck_up_lo_new) * this.statRank.luck_rank
        
        console.log(`recalculating levelups: 
        ${stat_new.wspd/1E6}+${newLevelups}*[${stat_new.wspd_lo/1E6}…${stat_new.wspd_hi/1E6}]*${Math.round(this.statRank.wspd_rank*1000)/10}%🔨 
        ${stat_new.mspd/100}+${newLevelups}*[${stat_new.mspd_lo/1E6}…${stat_new.mspd_hi/1E6}]*${Math.round(this.statRank.wspd_rank*1000)/10}%🦶 
        ${stat_new.luck/1E4}+${newLevelups}*[${stat_new.luck_lo/1E4}…${stat_new.luck_hi/1E4}]*${Math.round(this.statRank.luck_rank*1000)/10}%🍀`)

        this.workerEditing.wspdSheet += (stat_new.wspd - stat_old.wspd + wspd_up_new - wspd_up_old)/1E6
        this.workerEditing.mspdSheet = stat_new.mspd/100 * (1 + mspd_up_new/1E6)
        this.workerEditing.luckSheet += (stat_new.luck - stat_old.luck + luck_up_new - luck_up_old)/1E4
      }
      else {
        this.workerEditing.wspdSheet += (stat_new.wspd - stat_old.wspd)/1E6
        this.workerEditing.mspdSheet = stat_new.mspd * (this.workerEditing.mspdSheet/stat_old.mspd)
        this.workerEditing.luckSheet += (stat_new.luck - stat_old.luck)/1E4
        levelup(this.gameStore, this.workerEditing, newLevel)
      }
      this.workerEditing.wspdSheet = Math.round(this.workerEditing.wspdSheet*100)/100
      this.workerEditing.mspdSheet = Math.round(this.workerEditing.mspdSheet*100)/100
      this.workerEditing.luckSheet = Math.round(this.workerEditing.luckSheet*100)/100
      this.workerEditing.charkey = newChar
      this.workerEditing.level = newLevel
      this.limitSkillCount()
    },

    limitSkillCount() {
      const maxSkillsNow = 1 + Math.floor(this.workerEditing.level / 5)
      if (this.workerEditing.skills.length > maxSkillsNow) {
        this.workerEditing.skills.splice(maxSkillsNow)
      }
    },

    levelupMe(newlevel) {
      this.limitSkillCount()
      levelup(this.gameStore, this.workerEditing, newlevel)
      this.workerEditing.wspdSheet = Math.floor(this.workerEditing.wspdSheet*100)/100
      this.workerEditing.mspdSheet = Math.floor(this.workerEditing.mspdSheet*100)/100
      this.workerEditing.luckSheet = Math.floor(this.workerEditing.luckSheet*100)/100
    },

    setStatsRandom() {
      const w = this.workerEditing
      const stat = this.gameStore.workerStatic[w.charkey]
      let pa_wspd = stat.wspd
      let pa_mspdBonus = 0
      let pa_luck = stat.luck
      for (let i = 2; i <= w.level; i++) {
        pa_wspd += randBetween(stat.wspd_lo, stat.wspd_hi)
        pa_mspdBonus += randBetween(stat.mspd_lo, stat.mspd_hi)
        pa_luck += randBetween(stat.luck_lo, stat.luck_hi)
      }

      let pa_mspd = stat.mspd * (1 + pa_mspdBonus / 1E6)

      w.wspdSheet = Math.round(pa_wspd / 1E6 * 100) / 100
      w.mspdSheet = Math.round(pa_mspd) / 100
      w.luckSheet = Math.round(pa_luck / 1E4 * 100) / 100
    },

    setStatsMedian() {
      const w = this.workerEditing
      const stat = this.gameStore.workerStatic[w.charkey]
      let pa_wspd = stat.wspd
      let pa_mspdBonus = 0
      let pa_luck = stat.luck
      for (let i = 2; i <= w.level; i++) {
        pa_wspd += (stat.wspd_lo + stat.wspd_hi) / 2
        pa_mspdBonus += (stat.mspd_lo + stat.mspd_hi) / 2
        pa_luck += (stat.luck_lo + stat.luck_hi) / 2
      }

      let pa_mspd = stat.mspd * (1 + pa_mspdBonus / 1E6)

      w.wspdSheet = Math.round(pa_wspd / 1E6 * 100) / 100
      w.mspdSheet = Math.round(pa_mspd) / 100
      w.luckSheet = Math.round(pa_luck / 1E4 * 100) / 100
    },

  },
}
</script>

<template>
  <div id="columns" v-if="workerEditing">
    <div id="worker">

      <table class="borderless">
        <tr>
          <td>name:</td>
          <td>
            <input v-model="workerEditing.label" style="width:10em;">
            lvl.{{ workerEditing.level }} 
            <button @click="levelupMe(workerEditing.level+1)">🠕</button>
            <button @click="recalcStats(workerEditing.charkey, workerEditing.level-1)">🠗</button>
            <button v-if="0" @click="levelupMe(40)" class="tooltip-btn" data-tooltip="random to max">🠕🠕</button>
            <div style="float:right;">
              <button v-if="wasChanged && workerInitial" @click="revert()">revert</button>
            </div>
          </td>
        </tr>
        <tr>
          <td>type:</td>
          <td>
            <template v-if="prerelease_charkind">
              <select @change="recalcStats($event.target.value, workerEditing.level)" :value="workerEditing.charkey">
                <option v-for="st, k in gameStore.workerStatic" :value="k">
                  {{ k }} {{ gameStore.uloc.char[k] }} {{ st.wspd/1E6 }} / {{ st.mspd/100 }} / {{ st.luck/1E4 }}
                </option>
              </select>
            </template>
            <template v-else>
              {{ gameStore.uloc.char[workerEditing.charkey] }}
            </template>
          </td>
        </tr>


        <tr v-if="workerEditing.job && gameStore.jobIsPz(workerEditing.job)">
          <td>stash:</td>
          <td>
            <select v-model="workerEditing.job.storage">
              <option v-for="tnk in gameStore.townSet" :value="tnk">
                {{ gameStore.uloc.node[tnk] }}
              </option>
            </select>
          </td>
        </tr>


        <tr>
          <td>job:</td>
          <td>
            
            <template v-if="gameStore.jobIsIdle(workerEditing.job)">
              idle
            </template>

            <template v-else-if="gameStore.jobIsPz(workerEditing.job)">
              {{ gameStore.plantzoneName(workerEditing.job.pzk) }}
              / 
              <span v-if="gameStore.ready && workerEditing.job && workerEditing.job.pzk &&gameStore.plantzones[workerEditing.job.pzk].regiongroup && userStore.allowFloating && userStore.useFloatingModifiers[gameStore.plantzones[workerEditing.job.pzk].regiongroup]">
                ~{{ formatFixed(userStore.medianWorkloads[workerEditing.job.pzk], 2) }}
                <span @click="showChartPane = !showChartPane">{{ showChartPane ? "◀" : "▶" }}</span>
              </span>
              <span v-else>
                {{ formatFixed(gameStore.plantzones[workerEditing.job.pzk].activeWorkload, 2) }}
              </span>
            </template>

            <template v-else-if="gameStore.jobIsCustom(workerEditing.job)">
              ✍️
              <input class="workshop-label-input" v-model="workerEditing.job[3]"/>
              @
              <input type="number" class="float4" step="0.1" v-model.number="workerEditing.job[1]"/>M$/day
              <input type="number" class="float4" v-model.number="workerEditing.job[2]"/>CP
            </template>

            <template v-else-if="gameStore.jobIsFarming(workerEditing.job)">
              [🌻]
            </template>

            <template v-else-if="gameStore.jobIsWorkshop(workerEditing.job)">
              {{ gameStore.workerJobDescription(workerEditing) }}
              /
              {{ userStore.userWorkshops[workerEditing.job.hk].manualWorkload }}

              <abbr class="tooltip" title="see Settings > 🏭Workshops">ℹ️</abbr>

              <span class="fsxs">
                [type: {{ userStore.userWorkshops[workerEditing.job.hk].industry }}]
              </span>

            </template>

            <template v-else-if="gameStore.jobIsCustom(workerEditing.job)">
              ✍️
              <input class="workshop-label-input" v-model="workerEditing.job[3]"/>
              @
              <input type="number" class="float4" step="0.1" v-model.number="workerEditing.job[1]"/>M$/day
              <input type="number" class="float4" v-model.number="workerEditing.job[2]"/>CP
            </template>

            <template v-else>
              UNKNOWN_JOBTYPE
            </template>
            
          </td>
        </tr>

        <tr v-if="workerEditing.job">
          <td>$/day:</td>
          <td>
            <template v-if="gameStore.jobIsPz(workerEditing.job)">
              {{ spaceSep(initialProfit) }} 
              <span v-if="newProfit != initialProfit">
                → {{ spaceSep(newProfit) }} 
                <span :class="{ greenText: newProfit > initialProfit, redText: newProfit < initialProfit, fsxs: 1 }">
                  {{ formatFixed(100 * (newProfit - initialProfit) / initialProfit, 2, true) }}%
                </span>
              </span>
            </template>
            <template v-else-if="gameStore.jobIsFarming(workerEditing.job)">
              {{ spaceSep(userStore.workerIncome(workerEditing)) }}
            </template>
            <template v-else-if="gameStore.jobIsWorkshop(workerEditing.job)">
              {{ spaceSep(initialProfit) }} 
              <span v-if="newProfit != initialProfit">
                → {{ spaceSep(newProfit) }} 
                <span :class="{ greenText: newProfit > initialProfit, redText: newProfit < initialProfit, fsxs: 1 }">
                  {{ formatFixed(100 * (newProfit - initialProfit) / initialProfit, 2, true) }}%
                </span>
              </span>
            </template>
          </td>
        </tr>
      
        <tr><td colspan="2">
          <table class="borderless" v-if="gameStore.ready">
            <tr>
              <th>stats:</th>
              <th class="fsxs">rank</th>
              <th>sheet</th>
              <th>+</th>
              <th>skill</th>
              <th>=</th>
              <th>final</th>
              <th></th>
            </tr>
            <tr class="center">
              <td rowspan="3">
                <button @click="setStatsMedian()" class="fsxxs">median</button><br/>
                <button @click="setStatsRandom()" class="fsxxs">random</button>
              </td>
              <td class="fsxs">
                {{ formatFixed(statRank.wspd_rank*100, 1) }}%
              </td>
              <td><input type="number" v-model="workerEditing.wspdSheet" step="0.01" class="w5em right"/></td>
              <td></td>
              <td>{{ formatFixed(currentWspdBonus, 2) }}</td>
              <td></td>
              <td>{{ formatFixed(workerEditing.wspdSheet + currentWspdBonus, 2) }}</td>
              <td>🔨</td>
            </tr>
            <tr class="center">
              <td class="fsxs">
                {{ formatFixed(statRank.mspd_rank*100, 1) }}%
              </td>
              <td><input type="number" v-model="workerEditing.mspdSheet" step="0.01" class="w5em right"/></td>
              <td></td>
              <td>{{ formatFixed(gameStore.mspdBonus(workerEditing), 1) }}%</td>
              <td></td>
              <td>{{ formatFixed(gameStore.workerStatic[workerEditing.charkey].mspd/100 * ((workerEditing.mspdSheet / (gameStore.workerStatic[workerEditing.charkey].mspd/100)) + gameStore.mspdBonus(workerEditing) / 100), 2) }}</td>
              <td>🦶</td>
            </tr>
            <tr class="center">
              <td class="fsxs">
                {{ formatFixed(statRank.luck_rank*100, 1) }}%
              </td>
              <td><input type="number" v-model="workerEditing.luckSheet" step="0.01" class="w5em right"/></td>
              <td></td>
              <td>{{ formatFixed(gameStore.luckBonus(workerEditing), 2) }}</td>
              <td></td>
              <td>{{ formatFixed(workerEditing.luckSheet + gameStore.luckBonus(workerEditing), 2) }}</td>
              <td>🍀</td>
            </tr>
          </table>
        </td></tr>
        <tr class="center">
          <td>skills:</td>
          <td>
            <div style="float:right;">
              <button :disabled="!(workerEditing.job && workerEditing.job.pzk in userStore.pzJobs)" @click="suggestBestSkills(workerEditing.level, true)">
                optimize
              </button>
            </div>
          </td>
        </tr>
      
        <tr v-for="n in 9">
          <td colspan="2" s>
            <select 
              :id="'skill'+(n-1)"
              v-model="workerEditing.skills[n-1]"
              class="w30em animable"
              style="width:30em;"
            >
              <option v-for="sk in gameStore.availableSkillPool(workerEditing.skills, workerEditing.skills[n-1])" :value="sk">
                {{ gameStore.uloc.skill[sk] + " / " + gameStore.uloc.skilldesc[sk] }}
              </option>
            </select> 
            <img v-if="prerelease_skillicon" :src="`data/icons/skill/${workerEditing.skills[n-1]}.png`" width="22" height="22"/>
          </td>
        </tr>
      </table>
      
      <template v-if="gameStore.ready && workerEditing.job && gameStore.jobIsPz(workerEditing.job) && workerEditing.job.pzk in gameStore.plantzones && gameStore.plantzones[workerEditing.job.pzk].regiongroup && userStore.allowFloating">
        <input type="checkbox" v-model="userStore.useFloatingModifiers[gameStore.plantzones[workerEditing.job.pzk].regiongroup]">
        use floating modifier for this regionGroup
      </template>
    </div>

    <div id="chartPane" v-if="showChartPane && gameStore.ready && workerEditing.job && workerEditing.job.pzk && workerEditing.job.pzk in gameStore.plantzones && gameStore.plantzones[workerEditing.job.pzk].regiongroup && userStore.useFloatingModifiers[gameStore.plantzones[workerEditing.job.pzk].regiongroup]">
      <FloatingModifierEdit 
        :rgk="gameStore.plantzones[workerEditing.job.pzk].regiongroup"
        :wspd="workerEditing.wspdSheet + currentWspdBonus"
        :workload="gameStore.plantzones[workerEditing.job.pzk].workload"
        :show="true"
      />
    </div> 

  </div>
</template>

<style scoped>
#columns {
  display: flex;
}
#chartPane {
  margin-left: 10px;
}

select.animable {
  border-color: var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
}
.anim {
  background-color: var(--color-background);
  animation-name: highlight;
  animation-duration: 0.5s;
}

@keyframes highlight {
  0%   {background-color:var(--color-background); }
  50%  {background-color:hsla(160, 100%, 37%, 0.1); }
  100% {background-color:var(--color-background); }
}

.tooltip-btn {
  position: relative;
}

.tooltip-btn::after {
  content: attr(data-tooltip);
  font-size: 12px;
  font-family: system-ui;
  
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(0%);
  padding: 2px 6px 4px 6px;
  border: 1px solid gray;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.tooltip-btn:hover::after {
  opacity: 1;
  visibility: visible;
}

.tooltip {
  cursor: help;
}
</style>