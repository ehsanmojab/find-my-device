<template>
  <div class="max-w-6xl mx-auto animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <router-link to="/" class="btn btn-ghost" style="padding: 0.5rem;" title="Back to Dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </router-link>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <span>{{ device?.phone_name || 'Device History' }}</span>
          <span v-if="device?.revoked" class="text-xs font-medium px-2.5 py-0.5 rounded-full" style="background: rgba(239,68,68,0.2); color: #fca5a5;">Revoked</span>
          <span v-else class="text-xs font-medium px-2.5 py-0.5 rounded-full" style="background: rgba(34,197,94,0.15); color: #86efac;">Active</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <button v-if="device && !device.revoked" id="btn-revoke" class="btn btn-ghost" style="font-size: 0.8rem;" @click="revokeDevice">
          Revoke Access
        </button>
        <button id="btn-delete" class="btn btn-danger" style="font-size: 0.8rem;" @click="deleteDevice">
          Delete Device
        </button>
      </div>
    </div>

    <!-- Device Telemetry Summary Card -->
    <div v-if="device" class="glass-card p-5 mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span style="color: var(--color-text-muted);" class="text-xs">Phone Name</span>
          <p class="font-semibold text-base">{{ device.phone_name }}</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);" class="text-xs">Last Seen</span>
          <p class="font-semibold text-base">{{ device.last_seen ? formatTime(device.last_seen) : 'Never' }}</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);" class="text-xs">Distance Recorded</span>
          <p class="font-semibold text-base text-blue-400">{{ totalDistanceKm }} km</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);" class="text-xs">Data Points</span>
          <p class="font-semibold text-base text-emerald-400">{{ totalPoints }} points</p>
        </div>
      </div>
    </div>

    <!-- Date/Time Filters -->
    <div class="glass-card p-4 mb-6 flex flex-wrap items-end gap-3 text-xs">
      <div>
        <label for="filter-from" class="block font-medium mb-1" style="color: var(--color-text-muted);">From</label>
        <input id="filter-from" v-model="filterFrom" type="datetime-local" class="input" style="max-width: 200px; font-size: 0.75rem;" />
      </div>
      <div>
        <label for="filter-to" class="block font-medium mb-1" style="color: var(--color-text-muted);">To</label>
        <input id="filter-to" v-model="filterTo" type="datetime-local" class="input" style="max-width: 200px; font-size: 0.75rem;" />
      </div>
      <button id="btn-apply-filter" class="btn btn-primary" style="font-size: 0.75rem; padding: 0.5rem 1rem;" @click="loadHistory">
        Filter
      </button>
      <button id="btn-clear-filter" class="btn btn-ghost" style="font-size: 0.75rem; padding: 0.5rem 0.75rem;" @click="clearFilter">
        Reset
      </button>

      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="locations.length > 0"
          class="btn btn-ghost"
          style="font-size: 0.75rem; padding: 0.5rem 0.75rem;"
          @click="zoomToLatest"
        >
          Latest Position
        </button>
        <span style="color: var(--color-text-muted);">
          Showing {{ locations.length }} of {{ totalPoints }} points
        </span>
      </div>
    </div>

    <!-- Navigation Map Card -->
    <div class="glass-card mb-6 overflow-hidden relative shadow-2xl" style="border: 1px solid rgba(148, 163, 184, 0.2);">
      <!-- Floating Map Header Controls: Live Position vs Movement Path Toggle -->
      <div class="absolute top-3 left-3 z-[1000] flex items-center gap-2 pointer-events-auto flex-wrap">
        <div class="glass-card flex p-1 rounded-xl shadow-xl" style="background: rgba(15, 23, 42, 0.9); border-color: rgba(148, 163, 184, 0.25);">
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :style="viewMode === 'live' ? 'background: var(--color-primary); color: white;' : 'color: var(--color-text-muted);'"
            @click="setViewMode('live')"
          >
            <span class="w-2 h-2 rounded-full" :style="{ background: viewMode === 'live' ? '#86efac' : '#94a3b8' }"></span>
            Live Position
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
          v-if="viewMode === 'path'"
          class="btn btn-ghost backdrop-blur-md shadow-xl"
          style="font-size: 0.75rem; padding: 0.45rem 0.75rem; background: rgba(15, 23, 42, 0.9); border-color: rgba(148,163,184,0.25); color: white;"
          @click="fitRoute"
          title="Fit full route in view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
          Fit Route
        </button>
      </div>

      <div id="device-map" class="map-container map-container-large" style="height: 520px; width: 100%;"></div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="text-center mb-6">
      <button id="btn-load-more" class="btn btn-ghost" @click="loadMore">Load More Points</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="spinner"></div>
    </div>

    <!-- Confirm modal -->
    <div v-if="showConfirm" class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.6);">
      <div class="glass-card p-6 animate-fade-in" style="max-width: 400px; width: 90%;">
        <h3 class="text-lg font-bold mb-2">{{ confirmTitle }}</h3>
        <p class="text-sm mb-6" style="color: var(--color-text-muted);">{{ confirmMessage }}</p>
        <div class="flex gap-3 justify-end">
          <button class="btn btn-ghost" @click="showConfirm = false">Cancel</button>
          <button class="btn btn-danger" @click="confirmAction">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { createOsmTileLayer, createRadarIcon, createStartIcon, calculateTotalDistanceKm } from '../lib/mapUtils.js'
import L from 'leaflet'

const props = defineProps({ id: String })
const router = useRouter()

const device = ref(null)
const locations = ref([])
const loading = ref(true)
const filterFrom = ref('')
const filterTo = ref('')
const totalPoints = ref(0)
const hasMore = ref(false)
const PAGE_SIZE = 2000
const viewMode = ref('path') // 'live' or 'path'

let map = null
let polyline = null
let startMarker = null
let endMarker = null
let autoRefreshTimer = null

const showConfirm = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let pendingAction = null

const totalDistanceKm = computed(() => calculateTotalDistanceKm(locations.value))

function formatTime(ts) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text || ''
  return div.innerHTML
}

async function loadDevice() {
  const { data } = await supabase
    .from('devices')
    .select('*')
    .eq('id', props.id)
    .single()
  device.value = data
}

async function loadHistory() {
  loading.value = true

  let query = supabase
    .from('locations')
    .select('lat, lon, recorded_at', { count: 'exact' })
    .eq('device_id', props.id)
    .order('recorded_at', { ascending: true })

  if (filterFrom.value) {
    query = query.gte('recorded_at', new Date(filterFrom.value).toISOString())
  }
  if (filterTo.value) {
    query = query.lte('recorded_at', new Date(filterTo.value).toISOString())
  }

  query = query.limit(PAGE_SIZE)

  const { data, count } = await query

  locations.value = data || []
  totalPoints.value = count || 0
  hasMore.value = (count || 0) > locations.value.length
  loading.value = false

  await nextTick()
  drawMap()
}

async function loadMore() {
  if (!hasMore.value) return
  loading.value = true

  let query = supabase
    .from('locations')
    .select('lat, lon, recorded_at')
    .eq('device_id', props.id)
    .order('recorded_at', { ascending: true })

  if (filterFrom.value) {
    query = query.gte('recorded_at', new Date(filterFrom.value).toISOString())
  }
  if (filterTo.value) {
    query = query.lte('recorded_at', new Date(filterTo.value).toISOString())
  }

  const lastRecorded = locations.value[locations.value.length - 1]?.recorded_at
  if (lastRecorded) {
    query = query.gt('recorded_at', lastRecorded)
  }

  query = query.limit(PAGE_SIZE)

  const { data } = await query
  if (data && data.length > 0) {
    locations.value = [...locations.value, ...data]
    hasMore.value = data.length === PAGE_SIZE
  } else {
    hasMore.value = false
  }

  loading.value = false
  drawMap()
}

function clearFilter() {
  filterFrom.value = ''
  filterTo.value = ''
  loadHistory()
}

function setViewMode(mode) {
  viewMode.value = mode
  drawMap()
  if (mode === 'live') {
    zoomToLatest()
  } else {
    fitRoute()
  }
}

function fitRoute() {
  if (!map || locations.value.length === 0) return
  if (polyline) {
    map.flyToBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 16, duration: 1.2 })
  } else if (locations.value.length > 0) {
    const last = locations.value[locations.value.length - 1]
    map.flyTo([Number(last.lat), Number(last.lon)], 16, { duration: 1.2 })
  }
}

function initMap() {
  const el = document.getElementById('device-map')
  if (!el || map) return

  map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
  })

  // Custom zoom control in bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  // Standard OpenStreetMap base layer
  createOsmTileLayer().addTo(map)

  window.addEventListener('resize', onMapResize)
}

function drawMap() {
  if (!map) initMap()
  if (!map) return

  // Clear previous layers
  if (polyline) {
    map.removeLayer(polyline)
    polyline = null
  }
  if (startMarker) {
    map.removeLayer(startMarker)
    startMarker = null
  }
  if (endMarker) {
    map.removeLayer(endMarker)
    endMarker = null
  }

  if (locations.value.length === 0) {
    map.setView([35.6892, 51.3890], 5)
    return
  }

  const coords = locations.value.map(l => [Number(l.lat), Number(l.lon)])
  const first = locations.value[0]
  const last = locations.value[locations.value.length - 1]

  // Render polyline trail and start marker if in 'path' mode
  if (viewMode.value === 'path' && coords.length > 1) {
    polyline = L.polyline(coords, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1.2,
      lineJoin: 'round',
    }).addTo(map)

    startMarker = L.marker([Number(first.lat), Number(first.lon)], {
      icon: createStartIcon(),
    }).addTo(map)
    startMarker.bindPopup(`
      <strong style="color:#22c55e;">Journey Start</strong><br/>
      <span style="font-size:0.75rem;color:#94a3b8;">${escapeHtml(formatTime(first.recorded_at))}</span><br/>
      <span style="font-family:monospace;font-size:0.75rem;color:#93c5fd;">${Number(first.lat).toFixed(5)}, ${Number(first.lon).toFixed(5)}</span>
    `)
  }

  // Latest marker (Current Live Beacon)
  endMarker = L.marker([Number(last.lat), Number(last.lon)], {
    icon: createRadarIcon('#3b82f6', true),
  }).addTo(map)
  endMarker.bindPopup(`
    <strong style="color:#60a5fa;">${viewMode.value === 'live' ? 'Live Position' : 'Latest Position'}</strong><br/>
    <span style="font-size:0.75rem;color:#94a3b8;">${escapeHtml(formatTime(last.recorded_at))}</span><br/>
    <span style="font-family:monospace;font-size:0.75rem;color:#93c5fd;">${Number(last.lat).toFixed(5)}, ${Number(last.lon).toFixed(5)}</span>
  `)

  // Camera viewport
  if (viewMode.value === 'live' || coords.length === 1) {
    map.setView([Number(last.lat), Number(last.lon)], 16)
  } else if (polyline) {
    map.fitBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 16 })
  }

  setTimeout(() => {
    map?.invalidateSize()
  }, 150)
}

function zoomToLatest() {
  if (!map || locations.value.length === 0) return
  const last = locations.value[locations.value.length - 1]
  map.flyTo([Number(last.lat), Number(last.lon)], 16, { duration: 1.2 })
  if (endMarker) {
    setTimeout(() => endMarker.openPopup(), 600)
  }
}

function onMapResize() {
  map?.invalidateSize()
}

function revokeDevice() {
  confirmTitle.value = 'Revoke Device'
  confirmMessage.value = 'Are you sure? This device will immediately stop accepting new location data.'
  pendingAction = async () => {
    await supabase.from('devices').update({ revoked: true }).eq('id', props.id)
    await loadDevice()
  }
  showConfirm.value = true
}

function deleteDevice() {
  confirmTitle.value = 'Delete Device'
  confirmMessage.value = 'Are you sure? All historical location points for this device will be permanently deleted.'
  pendingAction = async () => {
    await supabase.from('devices').delete().eq('id', props.id)
    router.push({ name: 'Dashboard' })
  }
  showConfirm.value = true
}

async function confirmAction() {
  if (pendingAction) await pendingAction()
  showConfirm.value = false
  pendingAction = null
}

onMounted(async () => {
  await loadDevice()
  await loadHistory()

  // Auto-refresh every 15s to update as the device moves
  autoRefreshTimer = setInterval(async () => {
    if (!filterFrom.value && !filterTo.value) {
      await loadDevice()
      await loadHistory()
    }
  }, 15000)
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
