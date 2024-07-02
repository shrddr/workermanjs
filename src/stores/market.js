import {defineStore} from "pinia";
import {useGameStore} from './game'
import {useUserStore} from './user'

export const useMarketStore = defineStore({
  id: "market",
  state: () => ({
    ready: false,
    apiPrices: [],
    apiAlive: false,
    calculatedPrices: {},
    apiDatetime: 0,
  }),
  
  actions: {
    async fetchData() {
      const start = Date.now()

      const userStore = useUserStore()
      const lang = userStore.selectedLang == 'jp' ? 'ja' : userStore.selectedLang
      const MARKETURL = `https://apiv2.bdolytics.com/${lang}/${userStore.selectedRegion}/market/central-market-data`
      const bdolytics = await (await fetch(MARKETURL)).json()

      const gameStore = useGameStore()
      const uset = new Set(gameStore.itemKeys)
      console.log('uset', uset)

      const apiPrices = {}
      bdolytics.data.forEach(rec => {
        if (uset.has(rec.item_id)) {
          apiPrices[rec.item_id] = rec.price
        }
      })

      for (const key of Object.keys(gameStore.vendorPrices)) {
        userStore.keepItems[key] = true
      }

      //this.calculatedPrices = { 1024: {5201: 0.125, 5203: 0.125, 5205: 0.125, 5207: 0.125, 5209: 0.125, 5211: 0.125, 5213: 0.125, 5215: 0.125, }}
      this.calculatedPrices = await (await fetch(`data/manual/calculated_prices.json`)).json()

      if (4001 in apiPrices) {
        this.apiPrices = apiPrices
        this.apiDatetime = Date.now()
        this.apiAlive = true
        this.ready = true
        localStorage.setItem('market', JSON.stringify(this.$state))
      }
      
      console.log('fetchMarket took', Date.now()-start, 'ms')
    },

    itemPriceUrl(ik) {
      if (ik in this.apiPrices) return `https://bdolytics.com/market/central-market/item/${ik}`
      const userStore = useUserStore()
      return userStore.itemUrl + ik
    },

    priceBunch(bunch) {
      if (bunch === null)
        return null
      if (typeof bunch === 'undefined')
        return null
      let ret = 0
      for (const [k, q] of Object.entries(bunch)) {
        ret += this.prices[k] * q
      }
      return ret
    },

    pricePzd(pzd, luck) {
      const u = this.priceBunch(pzd.unlucky)
      if (pzd.lucky) {
        const l = this.priceBunch(pzd.lucky)
        return luck/100 * l + (1 - luck/100) * u
      }
      return u
    },

    priceLerp(luckyPrice, unluckyPrice, luck) {
      if (luckyPrice === null)
        return unluckyPrice
      return luck/100 * luckyPrice + (1 - luck/100) * unluckyPrice
    },

  },

  getters: {
    prices() {
      const start = Date.now()
      const userStore = useUserStore()
      const gameStore = useGameStore()
      
      let ret = {}
      for (const [key, value] of Object.entries(this.apiPrices)) {
        ret[key] = value
      }
      for (const [key, value] of Object.entries(gameStore.vendorPrices)) {
        ret[key] = value
      }

      for (const key of Object.keys(ret)) {
        if (key in userStore.customPrices && userStore.customPrices[key] !== "")
          ret[key] = userStore.customPrices[key]
        // apply tax
        if (key in userStore.keepItems && userStore.keepItems[key])
          continue
        if (key in gameStore.vendorPrices)
          continue
        ret[key] *= userStore.selectedTax
      }

      for (const [key, value] of Object.entries(this.calculatedPrices)) {
        if (key in userStore.customPrices && userStore.customPrices[key] !== "")
          continue
        ret[key] = 0
        for (const [component_ik, qty] of Object.entries(value)) {
          ret[key] += ret[component_ik] * qty
        }
        //console.log('calculated price:', key, ret[key])
      }
      
      console.log('prices getter took', Date.now()-start, 'ms')
      return ret
    },


  },
});
