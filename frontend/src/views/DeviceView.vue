<template>
  <div class="max-w-6xl mx-auto animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <router-link to="/" class="btn btn-ghost" style="padding: 0.5rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </router-link>
        <h1 class="text-2xl font-bold">{{ device?.phone_name || 'Device' }}</h1>
        <span v-if="device?.revoked" class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: rgba(239,68,68,0.2); color: #fca5a5;">Revoked</span>
      </div>
      <div class="flex gap-2">
        <button v-if="device && !device.revoked" id="btn-revoke" class="btn btn-ghost" style="font-size: 0.8rem;" @click="revokeDevice">
          Revoke
        </button>
        <button id="btn-delete" class="btn btn-danger" style="font-size: 0.8rem;" @click="deleteDevice">
          Delete
        </button>
      </div>
    </div>

    <!-- Info -->
    <div v-if="device" class="glass-card p-5 mb-6">
      <div class="grid grid-cols-2 gap-4 text-sm" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <div>
          <span style="color: var(--color-text-muted);">Phone Name</span>
          <p class="font-semibold">{{ device.phone_name }}</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);">Last Seen</span>
          <p class="font-semibold">{{ device.last_seen ? formatTime(device.last_seen) : 'Never' }}</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);">Created</span>
          <p class="font-semibold">{{ formatTime(device.created_at) }}</p>
        </div>
        <div>
          <span style="color: var(--color-text-muted);">Status</span>
          <p class="font-semibold" :style="{ color: device.revoked ? 'var(--color-danger)' : 'var(--color-success)' }">
            {{ device.revoked ? 'Revoked' : 'Active' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Date/time filters -->
    <div class="glass-card p-4 mb-6 flex flex-wrap items-end gap-4">
      <div>
        <label for="filter-from" class="block text-xs font-medium mb-1" style="color: var(--color-text-muted);">From</label>
        <input id="filter-from" v-model="filterFrom" type="datetime-local" class="input" style="max-width: 220px;" />
      </div>
      <div>
        <label for="filter-to" class="block text-xs font-medium mb-1" style="color: var(--color-text-muted);">To</label>
        <input id="filter-to" v-model="filterTo" type="datetime-local" class="input" style="max-width: 220px;" />
      </div>
      <button id="btn-apply-filter" class="btn btn-primary" style="font-size: 0.8rem;" @click="loadHistory">Apply</button>
      <button id="btn-clear-filter" class="btn btn-ghost" style="font-size: 0.8rem;" @click="clearFilter">Clear</button>
      <span class="text-xs ml-auto" style="color: var(--color-text-muted);">
        {{ totalPoints }} points{{ hasMore ? ' (showing first ' + locations.length + ')' : '' }}
      </span>
    </div>

    <!-- Map -->
    <div class="glass-card mb-6 overflow-hidden">
      <div id="device-map" class="map-container map-container-large"></div>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
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

let map = null
let polyline = null
let startMarker = null
let endMarker = null

const showConfirm = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let pendingAction = null

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function createDotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
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

function drawMap() {
  if (!map) initMap()

  // Clear previous
  if (polyline) map.removeLayer(polyline)
  if (startMarker) map.removeLayer(startMarker)
  if (endMarker) map.removeLayer(endMarker)

  if (locations.value.length === 0) {
    map.setView([0, 0], 2)
    return
  }

  const coords = locations.value.map(l => [l.lat, l.lon])

  polyline = L.polyline(coords, {
    color: '#3b82f6',
    weight: 3,
    opacity: 0.8,
    smoothFactor: 1.5,
  }).addTo(map)

  // Start marker (green)
  const first = locations.value[0]
  startMarker = L.marker([first.lat, first.lon], { icon: createDotIcon('#22c55e') }).addTo(map)
  startMarker.bindPopup(`<strong>Start</strong><br/>${escapeHtml(formatTime(first.recorded_at))}`)

  // End marker (red)
  const last = locations.value[locations.value.length - 1]
  endMarker = L.marker([last.lat, last.lon], { icon: createDotIcon('#ef4444') }).addTo(map)
  endMarker.bindPopup(`<strong>Latest</strong><br/>${escapeHtml(formatTime(last.recorded_at))}`)

  map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 16 })
}

function initMap() {
  const el = document.getElementById('device-map')
  if (!el) return

  map = L.map(el, { zoomControl: true })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
  }).addTo(map)
}

function revokeDevice() {
  confirmTitle.value = 'Revoke Device'
  confirmMessage.value = `This will stop "${device.value?.phone_name}" from sending location data. The token will be permanently invalidated.`
  pendingAction = async () => {
    await supabase
      .from('devices')
      .update({ revoked: true })
      .eq('id', props.id)
    await loadDevice()
    showConfirm.value = false
  }
  showConfirm.value = true
}

function deleteDevice() {
  confirmTitle.value = 'Delete Device'
  confirmMessage.value = `This will permanently delete "${device.value?.phone_name}" and all its location history. This cannot be undone.`
  pendingAction = async () => {
    await supabase
      .from('devices')
      .delete()
      .eq('id', props.id)
    router.push({ name: 'Dashboard' })
  }
  showConfirm.value = true
}

function confirmAction() {
  if (pendingAction) pendingAction()
}

onMounted(async () => {
  await loadDevice()
  await loadHistory()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>
