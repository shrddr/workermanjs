import {defineStore} from "pinia";

export const useMapStore = defineStore({
  id: "map",
  state: () => ({
    target: [0, 0],
    zoom: -8,
  }),
});
