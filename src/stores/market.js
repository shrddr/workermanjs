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
    apiPartial: false,
    apiFetching: false,
    apiMissingCount: 0,
    calculatedPrices: {},
    apiDatetime: 0,
  }),
  
  actions: {
    async fetchData() {
      this.apiFetching = true
      try {
        await this.fetchDataFromApis()
      }
      finally {
        this.apiFetching = false
      }
    },

    async fetchDataFromApis() {
      const start = Date.now()
      this.apiAlive = false
      this.apiPartial = false
      this.apiMissingCount = 0
      this.ready = false

      const userStore = useUserStore()
      const lang = userStore.selectedLang == 'jp' ? 'ja' : userStore.selectedLang
      const input = encodeURIComponent(JSON.stringify({
        language: lang,
        region: userStore.selectedRegion,
      }))
      const MARKETURL = `https://bdolytics.com/api/trpc/market.getMarket?input=${input}`
      const response = await fetch(MARKETURL)
      if (!response.ok) {
        throw new Error(`BDOlytics market request failed: ${response.status}`)
      }
      const bdolytics = await response.json()
      const marketEntries = bdolytics.result?.data
      if (!Array.isArray(marketEntries)) {
        throw new Error('BDOlytics market response has an unexpected format')
      }

      const gameStore = useGameStore()
      const uset = new Set(gameStore.itemKeys)
      uset.add(9492)  // feed
      //console.log('uset', uset)

      const apiPrices = {}
      marketEntries.forEach(entry => {
        if (entry.price > 0 && uset.has(entry.itemId)) {
          apiPrices[entry.itemId] = entry.price
        }
        else if (entry.price > 0 && gameStore.ready && gameStore.craftInputItemKeySet.has(entry.itemId)) {
          apiPrices[entry.itemId] = entry.price
        }
      })

      // openable sacks
      this.calculatedPrices = await (await fetch(`data/manual/calculated_prices.json`)).json()

      // Vendor-priced and locally calculated items do not need a market API price.
      const requiredMarketItems = [...uset].filter(itemId =>
        !(itemId in gameStore.vendorPrices) &&
        !(itemId in this.calculatedPrices)
      )
      let missingItems = requiredMarketItems.filter(itemId => !(itemId in apiPrices))

      // BDOlytics occasionally omits region-specific items. Arsha accepts repeated
      // id query parameters and returns either one object or an array of objects.
      if (missingItems.length > 0) {
        const arshaRegion = {
          CEU: 'console_eu',
          CNA: 'console_na',
        }[userStore.selectedRegion] ?? userStore.selectedRegion.toLowerCase()

        const fetchArshaBatch = async itemIds => {
          const params = new URLSearchParams()
          itemIds.forEach(itemId => params.append('id', itemId))
          params.set('lang', userStore.selectedLang)
          const url = `https://api.arsha.io/v2/${arshaRegion}/item?${params}`
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          const data = await response.json()
          return Array.isArray(data) ? data : [data]
        }

        const addArshaPrices = entries => {
          entries.forEach(entry => {
            if (missingItems.includes(entry.id) && entry.basePrice > 0) {
              apiPrices[entry.id] = entry.basePrice
            }
          })
        }

        // Small batches are more reliable on Arsha.
        for (let offset = 0; offset < missingItems.length; offset += 3) {
          const batch = missingItems.slice(offset, offset + 3)
          try {
            addArshaPrices(await fetchArshaBatch(batch))
          }
          catch (error) {
            console.warn('Arsha market batch failed', batch, error)
          }
        }

        // A successful response may still omit an item or contain a zero price.
        // Retry every unresolved item separately, with a short delay between
        // rounds to accommodate Arsha's occasionally flaky upstream cache.
        for (let attempt = 1; attempt <= 5; attempt++) {
          const unresolvedItems = requiredMarketItems.filter(itemId => !(itemId in apiPrices))
          if (unresolvedItems.length === 0) break
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          }
          for (const itemId of unresolvedItems) {
            try {
              addArshaPrices(await fetchArshaBatch([itemId]))
            }
            catch (itemError) {
              console.warn('Arsha market item failed', itemId, itemError)
            }
          }
        }
        missingItems = requiredMarketItems.filter(itemId => !(itemId in apiPrices))
      }
      this.apiMissingCount = missingItems.length

      for (const key of Object.keys(gameStore.vendorPrices)) {
        userStore.keepItems[key] = true
      }

      if (4202 in apiPrices) {
        this.apiPrices = apiPrices
        this.apiDatetime = Date.now()
        this.apiAlive = missingItems.length === 0
        this.apiPartial = missingItems.length > 0
        this.ready = true
        localStorage.setItem('market', JSON.stringify({...this.$state, apiFetching: false}))
      }
      if (missingItems.length > 0) {
        console.warn('Missing required market prices', missingItems)
      }
      
      console.log('fetchMarket took', Date.now()-start, 'ms')
    },

    itemPriceUrl(ik) {
      const userStore = useUserStore()
      if (ik in this.apiPrices) return `https://bdolytics.com/${userStore.selectedLang}/market/item/${ik}`
      return userStore.externalItemUrl + ik
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
