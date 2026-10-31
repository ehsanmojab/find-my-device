import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import 'leaflet/dist/leaflet.css'
import './style.css'

createApp(App).use(router).mount('#app')
