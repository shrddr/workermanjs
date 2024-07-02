import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import PlantzonesView from "../views/PlantzonesView.vue";
import LodgingView from "../views/LodgingView.vue";
import ModifiersView from "../views/ModifiersView.vue";
import SettingsView from "../views/SettingsView.vue";
import AboutView from "../views/AboutView.vue";
import OtherTownsView from "../views/OtherTownsView.vue";
import WorkshopsView from "../views/WorkshopsView.vue";
import HouseCraft from "../views/HouseCraft.vue";
import DropratesView from "../views/DropratesView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: '/plantzones',
      component: PlantzonesView
    },
    {
      path: '/modifiers',
      component: ModifiersView
    },
    {
      path: '/settings',
      component: SettingsView
    },
    {
      /*path: "/about",
      component: AboutView,*/

      path: "/about",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import("../views/AboutView.vue"),
    },
    {
      path: '/othertowns',
      component: OtherTownsView
    },
    {
      path: '/workshops',
      component: WorkshopsView
    },
    {
      path: '/housecraft',
      component: HouseCraft
    },
    {
      path: '/droprates',
      component: DropratesView
    },
    // deprecated
    {
      path: "/lodging",
      component: LodgingView,
    },
  ],
});

export default router;
