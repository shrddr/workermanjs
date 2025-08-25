import {defineStore} from "pinia";
import {useGameStore} from './game'
import {useUserStore} from './user'
import { formatFixed } from "../util";

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
      uset.add(9492)  // feed
      //console.log('uset', uset)

      const apiPrices = {}
      bdolytics.data.forEach(entry => {
        if (uset.has(entry.item_id)) {
          apiPrices[entry.item_id] = entry.price
        }
        else if (gameStore.ready && gameStore.craftInputItemKeySet.has(entry.item_id)) {
          apiPrices[entry.item_id] = entry.price
        }
      })

      for (const key of Object.keys(gameStore.vendorPrices)) {
        userStore.keepItems[key] = true
      }

      // openable sacks
      this.calculatedPrices = await (await fetch(`data/manual/calculated_prices.json`)).json()

      if (4202 in apiPrices) {
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
      const ret = {
        val: null,
        desc: '',
      }
      if (bunch === null) {
        return ret
      }
      if (typeof bunch === 'undefined') {
        return ret
      }
      ret.val = 0
      for (const [k, q] of Object.entries(bunch)) {
        if (k in this.prices) {
          const stackPrice = this.prices[k] * q
          ret.val += stackPrice
          const p = this.prices[k]
          const pStr = `${p}`.length < 8 ? `${p}` : formatFixed(p, 3)
          const qStr = `${q}`.length < 8 ? `${q}` : formatFixed(q, 3)
          const spStr = `${stackPrice}`.length < 8 ? `${stackPrice}` : formatFixed(stackPrice)
          ret.desc += `${pStr} x ${qStr} = ${spStr}\n`
        }
        else {
          ret.val = NaN
          ret.desc += `??? x ${q} = ???\n`
        }
      }
      return ret
    },

    pricePzd(pzd, luck) {
      const u = this.priceBunch(pzd.unlucky).val
      if (pzd.lucky) {
        const l = this.priceBunch(pzd.lucky).val
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
      for (const [key, custom] of Object.entries(userStore.customPrices)) {
        if (custom === "") continue
        ret[key] = custom
      }
      for (const [key, api] of Object.entries(this.apiPrices)) {
        if (key in ret) continue
        ret[key] = api
      }
      for (const [key, vendor] of Object.entries(gameStore.vendorPrices)) {
        if (key in ret) continue
        ret[key] = vendor
      }

      for (const key of Object.keys(ret)) {
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
        for (const [component_ik, component_qty] of Object.entries(value)) {
          ret[key] += ret[component_ik] * component_qty
        }
        //console.log('calculated price:', key, ret[key])
      }
      
      console.log('prices getter took', Date.now()-start, 'ms')
      return ret
    },


  },
});
