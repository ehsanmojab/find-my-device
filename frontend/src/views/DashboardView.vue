<template>
  <div class="max-w-6xl mx-auto animate-fade-in">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <p v-if="profile?.username || userEmail" class="text-sm" style="color: var(--color-text-muted);">
        Welcome, <span class="font-semibold" style="color: var(--color-text);">{{ profile?.username || userEmail }}</span>
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="spinner"></div>
    </div>

    <!-- No devices -->
    <div v-else-if="devices.length === 0" class="glass-card p-12 text-center">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style="background: rgba(59, 130, 246, 0.1);">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-primary);"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      </div>
      <h2 class="text-xl font-semibold mb-2">No devices yet</h2>
      <p class="mb-6" style="color: var(--color-text-muted);">Add your first device to start tracking.</p>
      <router-link to="/add-device" class="btn btn-primary">+ Add Device</router-link>
    </div>

    <!-- Map + device list -->
    <template v-else>
      <div class="glass-card mb-6 overflow-hidden">
        <div id="dashboard-map" class="map-container map-container-large"></div>
      </div>

      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
        <router-link
          v-for="device in devices"
          :key="device.id"
          :to="`/device/${device.id}`"
          class="glass-card p-5 no-underline transition-all hover:scale-[1.02]"
          style="color: inherit; cursor: pointer;"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" :style="{ background: device.revoked ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)' }">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ color: device.revoked ? 'var(--color-danger)' : 'var(--color-primary)' }"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              </div>
              <div>
                <h3 class="font-semibold text-base">{{ device.phone_name }}</h3>
                <span v-if="device.revoked" class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: rgba(239,68,68,0.2); color: #fca5a5;">Revoked</span>
              </div>
            </div>
            <div v-if="device.lastLocation" class="pulse-dot w-2.5 h-2.5 rounded-full" style="background: var(--color-success);"></div>
          </div>

          <div class="text-sm space-y-1" style="color: var(--color-text-muted);">
            <p v-if="device.last_seen">
              Last seen: <span style="color: var(--color-text);">{{ formatTime(device.last_seen) }}</span>
            </p>
            <p v-if="device.lastLocation">
              {{ device.lastLocation.lat.toFixed(5) }}, {{ device.lastLocation.lon.toFixed(5) }}
            </p>
            <p v-else style="color: var(--color-text-muted);">No location data yet</p>
          </div>
        </router-link>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { supabase } from '../lib/supabase.js'
import L from 'leaflet'

const profile = ref(null)
const userEmail = ref('')
const devices = ref([])
const loading = ref(true)
let map = null
const markers = []

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function createDeviceIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/></svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  })
}

async function loadData() {
  loading.value = true

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  userEmail.value = user.email || ''

  const { data: profileData } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
  profile.value = profileData

  const { data: deviceData } = await supabase
    .from('devices')
    .select('*')
    .order('created_at', { ascending: false })

  if (!deviceData) {
    loading.value = false
    return
  }

  // For each device, get the latest location
  for (const device of deviceData) {
    const { data: locData } = await supabase
      .from('locations')
      .select('lat, lon, recorded_at')
      .eq('device_id', device.id)
      .order('recorded_at', { ascending: false })
      .limit(1)

    device.lastLocation = locData?.[0] || null
  }

  devices.value = deviceData
  loading.value = false

  if (deviceData.some(d => d.lastLocation)) {
    await nextTick()
    initMap()
  }
}

function initMap() {
  if (map) {
    map.remove()
    map = null
  }

  const el = document.getElementById('dashboard-map')
  if (!el) return

  map = L.map(el, { zoomControl: true })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
  }).addTo(map)

  const bounds = []

  for (const device of devices.value) {
    if (!device.lastLocation || device.revoked) continue
    const { lat, lon } = device.lastLocation
    const marker = L.marker([lat, lon], {
      icon: createDeviceIcon('#3b82f6'),
    }).addTo(map)

    marker.bindPopup(`
      <strong>${escapeHtml(device.phone_name)}</strong><br/>
      <span style="color:#94a3b8;font-size:0.75rem;">${formatTime(device.last_seen)}</span><br/>
      <span style="color:#94a3b8;font-size:0.75rem;">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
    `)

    markers.push(marker)
    bounds.push([lat, lon])
  }

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
  } else {
    map.setView([0, 0], 2)
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

onMounted(loadData)

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>
