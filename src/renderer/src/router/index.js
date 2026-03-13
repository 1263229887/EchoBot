import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Settings from '../views/Settings.vue'
import ChatSummary from '../views/ChatSummary.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: Dashboard },
  { path: '/settings', component: Settings },
  { path: '/chat-summary', component: ChatSummary }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
