import { createRouter, createWebHashHistory } from 'vue-router'
import { supabase } from '../lib/supabase.js'

import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import DeviceView from '../views/DeviceView.vue'
import AddDeviceView from '../views/AddDeviceView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'Dashboard', component: DashboardView },
  { path: '/device/:id', name: 'Device', component: DeviceView, props: true },
  { path: '/add-device', name: 'AddDevice', component: AddDeviceView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { name: 'Login' }
  return true
})

export default router
