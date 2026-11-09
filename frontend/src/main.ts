import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'katex/dist/katex.min.css'
import './assets/main.css'
import './assets/fonts.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
