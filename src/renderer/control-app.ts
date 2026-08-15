import { createPinia } from "pinia";
import { createApp } from "vue";
import ControlApp from "./control/ControlApp.vue";
import "./styles/control.css";

createApp(ControlApp).use(createPinia()).mount("#app");
