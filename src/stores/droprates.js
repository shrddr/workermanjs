import {defineStore} from "pinia";

export const useDropratesStore = defineStore({
  id: "droprates",
  state: () => ({
    selected_pzk: "",
    selected_ik: "",
    selected_specie: "",
    selected_model: 'a',

    usePooling: false,
    plotChiSquared: false,
  }),
});