<template>
  <div class="min-h-screen">
    <nav v-if="isAuthenticated" class="glass-card sticky top-0 z-50 flex items-center justify-between px-6 py-3 mb-6 mx-4 mt-4" style="border-radius: 1rem;">
      <router-link to="/" class="flex items-center gap-2 text-lg font-bold no-underline" style="color: var(--color-primary);">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Find Any Device
      </router-link>
      <div class="flex items-center gap-3">
        <router-link to="/add-device" class="btn btn-primary" style="font-size: 0.8rem; padding: 0.5rem 1rem;">
          + Add Device
        </router-link>
        <button id="btn-logout" class="btn btn-ghost" style="font-size: 0.8rem; padding: 0.5rem 1rem;" @click="logout">
          Logout
        </button>
      </div>
    </nav>
    <main class="px-4 pb-8">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from './lib/supabase.js'

const router = useRouter()
const isAuthenticated = ref(false)

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  isAuthenticated.value = !!session
}

async function logout() {
  await supabase.auth.signOut()
  isAuthenticated.value = false
  router.push({ name: 'Login' })
}

onMounted(checkAuth)

watch(() => router.currentRoute.value.path, checkAuth)

supabase.auth.onAuthStateChange((_event, session) => {
  isAuthenticated.value = !!session
})
</script>
