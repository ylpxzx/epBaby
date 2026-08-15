import { createPinia } from "pinia";
import { createApp } from "vue";
import PetApp from "./pet/PetApp.vue";
import "./styles/pet.css";

createApp(PetApp).use(createPinia()).mount("#app");
