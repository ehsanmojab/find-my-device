<template>
  <div class="max-w-6xl mx-auto animate-fade-in">
    <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <span>Dashboard</span>
          <span v-if="activeDeviceCount > 0" class="text-xs px-2.5 py-1 rounded-full font-medium" style="background: rgba(34, 197, 94, 0.2); color: #86efac;">
            ● {{ activeDeviceCount }} Live
          </span>
        </h1>
        <p v-if="profile?.username || userEmail" class="text-sm mt-1" style="color: var(--color-text-muted);">
          Welcome, <span class="font-semibold" style="color: var(--color-text);">{{ profile?.username || userEmail }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button id="btn-refresh" class="btn btn-ghost" style="font-size: 0.8rem; padding: 0.5rem 0.875rem;" :disabled="loading" @click="loadData">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'animate-spin': loading }"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Refresh
        </button>
        <router-link to="/add-device" class="btn btn-primary" style="font-size: 0.8rem; padding: 0.5rem 1rem;">
          + Add Device
        </router-link>
      </div>
    </div>

    <!-- Loading spinner on initial load -->
    <div v-if="loading && devices.length === 0" class="flex justify-center py-20">
      <div class="spinner"></div>
    </div>

    <!-- Zero devices state -->
    <div v-else-if="devices.length === 0" class="glass-card p-12 text-center">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style="background: rgba(59, 130, 246, 0.1);">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-primary);"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      </div>
      <h2 class="text-xl font-semibold mb-2">No devices yet</h2>
      <p class="mb-6 text-sm" style="color: var(--color-text-muted);">Add your Android phone to start live tracking on the map.</p>
      <router-link to="/add-device" class="btn btn-primary">+ Add Your First Device</router-link>
    </div>

    <!-- Active Map & Devices -->
    <div v-else class="space-y-6">
      <!-- OpenStreetMap Card -->
      <div class="glass-card overflow-hidden relative shadow-2xl" style="border: 1px solid rgba(148, 163, 184, 0.2);">
        <!-- Floating Map Header Controls: Live Location vs Movement Path Toggle -->
        <div class="absolute top-3 left-3 z-[1000] flex items-center gap-2 pointer-events-auto flex-wrap">
          <div class="glass-card flex p-1 rounded-xl shadow-xl" style="background: rgba(15, 23, 42, 0.9); border-color: rgba(148, 163, 184, 0.25);">
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              :style="viewMode === 'live' ? 'background: var(--color-primary); color: white;' : 'color: var(--color-text-muted);'"
              @click="setViewMode('live')"
            >
              <span class="w-2 h-2 rounded-full" :style="{ background: viewMode === 'live' ? '#86efac' : '#94a3b8' }"></span>
              Live Location
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              :style="viewMode === 'path' ? 'background: var(--color-primary); color: white;' : 'color: var(--color-text-muted);'"
              @click="setViewMode('path')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="4" r="2"/><circle cx="20" cy="20" r="2"/><path d="M4 6v4a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v2"/></svg>
              Movement Path
            </button>
          </div>

          <button
            class="btn btn-ghost backdrop-blur-md shadow-xl"
            style="font-size: 0.75rem; padding: 0.45rem 0.75rem; background: rgba(15, 23, 42, 0.9); border-color: rgba(148,163,184,0.25); color: white;"
            @click="fitAllDevices"
            title="Recenter map on devices"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
            Recenter
          </button>
        </div>

        <!-- Path Statistics Badge (When Path mode is active) -->
        <div
          v-if="viewMode === 'path' && pathPoints.length > 0"
          class="absolute top-3 right-3 z-[1000] pointer-events-auto"
        >
          <div class="glass-card px-3.5 py-1.5 text-xs flex items-center gap-3 shadow-xl" style="background: rgba(15, 23, 42, 0.9); border-color: rgba(148, 163, 184, 0.25);">
            <div class="flex items-center gap-1.5 text-blue-400 font-semibold">
              <span class="w-2 h-2 rounded-full bg-blue-400"></span>
              {{ totalPathDistanceKm }} km traveled
            </div>
            <span style="color: var(--color-text-muted);">{{ pathPoints.length }} points</span>
          </div>
        </div>

        <!-- Waiting banner if no device has sent a location yet -->
        <div
          v-if="!hasAnyLocation"
          class="absolute inset-x-0 bottom-4 z-[1000] flex justify-center pointer-events-none px-4"
        >
          <div class="glass-card px-4 py-2.5 text-xs flex items-center gap-2 shadow-xl" style="background: rgba(15, 23, 42, 0.9);">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
            <span style="color: #fde68a;">Waiting for first device GPS sync from MacroDroid...</span>
          </div>
        </div>

        <div id="dashboard-map" class="map-container map-container-large" style="height: 520px; width: 100%;"></div>
      </div>

      <!-- Device Cards Grid -->
      <div>
        <h2 class="text-lg font-semibold mb-3 flex items-center justify-between">
          <span>Connected Devices ({{ devices.length }})</span>
          <span class="text-xs font-normal" style="color: var(--color-text-muted);">Auto-refreshing every 15s • Click card to locate</span>
        </h2>

        <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
          <div
            v-for="device in devices"
            :key="device.id"
            class="glass-card p-5 transition-all cursor-pointer hover:border-blue-500 hover:shadow-lg"
            :class="{ 'ring-2 ring-blue-500': selectedDeviceId === device.id }"
            @click="focusDevice(device)"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center transition-transform hover:scale-110"
                  :style="{ background: device.revoked ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)' }"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ color: device.revoked ? 'var(--color-danger)' : 'var(--color-primary)' }"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                </div>
                <div>
                  <h3 class="font-semibold text-base">{{ device.phone_name }}</h3>
                  <span v-if="device.revoked" class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: rgba(239,68,68,0.2); color: #fca5a5;">Revoked</span>
                  <span v-else-if="device.lastLocation" class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: rgba(34,197,94,0.15); color: #86efac;">Online</span>
                  <span v-else class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: rgba(148,163,184,0.15); color: #cbd5e1;">Awaiting GPS</span>
                </div>
              </div>

              <router-link
                :to="`/device/${device.id}`"
                class="btn btn-ghost"
                style="padding: 0.35rem 0.65rem; font-size: 0.75rem;"
                @click.stop
              >
                Full History →
              </router-link>
            </div>

            <div class="text-sm space-y-1.5" style="color: var(--color-text-muted);">
              <div class="flex justify-between items-center text-xs">
                <span>Last Seen:</span>
                <span class="font-medium" style="color: var(--color-text);">{{ formatTime(device.last_seen) }}</span>
              </div>
              <div v-if="device.lastLocation" class="flex justify-between items-center text-xs">
                <span>Coordinates:</span>
                <span class="font-mono" style="color: #93c5fd;">
                  {{ Number(device.lastLocation.lat).toFixed(5) }}, {{ Number(device.lastLocation.lon).toFixed(5) }}
                </span>
              </div>
              <div v-else class="text-xs italic" style="color: var(--color-text-muted);">
                No location received yet
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { supabase } from '../lib/supabase.js'
import { createOsmTileLayer, createRadarIcon, createStartIcon, calculateTotalDistanceKm } from '../lib/mapUtils.js'
import L from 'leaflet'

const profile = ref(null)
const userEmail = ref('')
const devices = ref([])
const loading = ref(true)
const selectedDeviceId = ref(null)
const viewMode = ref('live') // 'live' or 'path'
const pathPoints = ref([])

let map = null
let markers = new Map()
let pathPolyline = null
let startPointMarker = null
let autoRefreshTimer = null

const hasAnyLocation = computed(() => devices.value.some(d => d.lastLocation))
const activeDeviceCount = computed(() => devices.value.filter(d => d.lastLocation && !d.revoked).length)
const totalPathDistanceKm = computed(() => calculateTotalDistanceKm(pathPoints.value))

function formatTime(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text || ''
  return div.innerHTML
}

async function loadData() {
  loading.value = true

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    loading.value = false
    return
  }
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

  if (!deviceData || deviceData.length === 0) {
    devices.value = []
    loading.value = false
    return
  }

  // Load latest location point for each device
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

  // If in 'path' mode, load recent movement trail points
  if (viewMode.value === 'path') {
    await loadPathPoints()
  }

  loading.value = false

  await nextTick()
  initOrUpdateMap()
}

async function loadPathPoints() {
  // If a device is selected, load its path; otherwise load active device path
  const targetDevice = selectedDeviceId.value
    ? devices.value.find(d => d.id === selectedDeviceId.value)
    : devices.value.find(d => d.lastLocation && !d.revoked)

  if (!targetDevice) {
    pathPoints.value = []
    return
  }

  const { data } = await supabase
    .from('locations')
    .select('lat, lon, recorded_at')
    .eq('device_id', targetDevice.id)
    .order('recorded_at', { ascending: true })
    .limit(300)

  pathPoints.value = data || []
}

async function setViewMode(mode) {
  viewMode.value = mode
  if (mode === 'path') {
    await loadPathPoints()
  }
  renderMapLayers()
}

function initOrUpdateMap() {
  const el = document.getElementById('dashboard-map')
  if (!el) return

  if (!map) {
    map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
    })

    // Custom zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Standard OpenStreetMap as default and only tile layer
    createOsmTileLayer().addTo(map)

    window.addEventListener('resize', onMapResize)
  }

  renderMapLayers()
}

function renderMapLayers() {
  if (!map) return

  // Clear existing markers and paths
  markers.forEach(m => map.removeLayer(m))
  markers.clear()

  if (pathPolyline) {
    map.removeLayer(pathPolyline)
    pathPolyline = null
  }
  if (startPointMarker) {
    map.removeLayer(startPointMarker)
    startPointMarker = null
  }

  const bounds = []

  // 1. Draw Movement Path if active
  if (viewMode.value === 'path' && pathPoints.value.length > 0) {
    const coords = pathPoints.value.map(p => [Number(p.lat), Number(p.lon)])

    pathPolyline = L.polyline(coords, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.9,
      lineJoin: 'round',
      smoothFactor: 1.2,
    }).addTo(map)

    // Mark Journey Start Point
    const startPt = pathPoints.value[0]
    startPointMarker = L.marker([Number(startPt.lat), Number(startPt.lon)], {
      icon: createStartIcon(),
    }).addTo(map)
    startPointMarker.bindPopup(`
      <strong style="color:#22c55e;">Start Point</strong><br/>
      <span style="font-size:0.75rem;color:#94a3b8;">${formatTime(startPt.recorded_at)}</span>
    `)

    coords.forEach(c => bounds.push(c))
  }

  // 2. Draw Live Markers for Devices
  for (const device of devices.value) {
    if (!device.lastLocation || device.revoked) continue
    const lat = Number(device.lastLocation.lat)
    const lon = Number(device.lastLocation.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const marker = L.marker([lat, lon], {
      icon: createRadarIcon('#3b82f6', true),
    }).addTo(map)

    marker.bindPopup(`
      <div style="min-width: 180px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:0.95rem;color:#f1f5f9;">${escapeHtml(device.phone_name)}</strong>
          <span style="font-size:0.65rem;padding:2px 6px;border-radius:999px;background:rgba(34,197,94,0.2);color:#86efac;">LIVE</span>
        </div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:4px;">
          ⏱ ${formatTime(device.last_seen)}
        </div>
        <div style="font-family:monospace;font-size:0.75rem;background:rgba(15,23,42,0.6);padding:4px 8px;border-radius:4px;color:#93c5fd;display:inline-block;margin-top:4px;">
          ${lat.toFixed(5)}, ${lon.toFixed(5)}
        </div>
      </div>
    `)

    markers.set(device.id, marker)
    bounds.push([lat, lon])
  }

  // Camera viewport
  if (bounds.length === 1) {
    map.setView(bounds[0], 15)
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 })
  } else {
    map.setView([35.6892, 51.3890], 5)
  }

  setTimeout(() => {
    map?.invalidateSize()
  }, 150)
}

function onMapResize() {
  map?.invalidateSize()
}

function fitAllDevices() {
  const bounds = []
  markers.forEach(m => bounds.push(m.getLatLng()))
  if (bounds.length === 1) {
    map.flyTo(bounds[0], 15, { duration: 1.2 })
  } else if (bounds.length > 1) {
    map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 1.2 })
  }
}

async function focusDevice(device) {
  selectedDeviceId.value = device.id
  if (!device.lastLocation || !map) return

  if (viewMode.value === 'path') {
    await loadPathPoints()
    renderMapLayers()
  }

  const lat = Number(device.lastLocation.lat)
  const lon = Number(device.lastLocation.lon)
  map.flyTo([lat, lon], 16, { duration: 1.2 })

  const marker = markers.get(device.id)
  if (marker) {
    setTimeout(() => {
      marker.openPopup()
    }, 600)
  }
}

onMounted(() => {
  loadData()
  // Auto-refresh every 15 seconds to receive live moving device points
  autoRefreshTimer = setInterval(loadData, 15000)
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
  window.removeEventListener('resize', onMapResize)
  if (map) {
    map.remove()
    map = null
  }
})
</script>
