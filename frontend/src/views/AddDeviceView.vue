<template>
  <div class="max-w-2xl mx-auto animate-fade-in">
    <div class="flex items-center gap-3 mb-6">
      <router-link to="/" class="btn btn-ghost" style="padding: 0.5rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </router-link>
      <h1 class="text-2xl font-bold">Add Device</h1>
    </div>

    <!-- Step 1: Enter name -->
    <div v-if="step === 'name'" class="glass-card p-6">
      <h2 class="text-lg font-semibold mb-4">Device Name</h2>
      <p class="text-sm mb-4" style="color: var(--color-text-muted);">
        Enter a name for this device (e.g., "Samsung A54", "Mom's iPhone"). Max 50 characters.
      </p>
      <form @submit.prevent="createDevice">
        <input
          id="device-name"
          v-model="phoneName"
          type="text"
          class="input mb-4"
          placeholder="My Android Phone"
          maxlength="50"
          required
        />
        <div v-if="error" class="text-sm py-2 px-3 rounded-lg mb-4" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5;">
          {{ error }}
        </div>
        <button id="btn-create-device" type="submit" class="btn btn-primary w-full" :disabled="creating">
          <span v-if="creating" class="spinner" style="width: 1.25rem; height: 1.25rem; border-width: 2px;"></span>
          <span v-else>Create Device</span>
        </button>
      </form>
    </div>

    <!-- Step 2: Show token + setup instructions -->
    <div v-if="step === 'token'" class="space-y-6">
      <!-- Token display -->
      <div class="glass-card p-6" style="border-color: var(--color-primary);">
        <div class="flex items-center gap-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #fbbf24;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h2 class="text-lg font-semibold" style="color: #fbbf24;">Save This Token Now!</h2>
        </div>
        <p class="text-sm mb-4" style="color: var(--color-text-muted);">
          This token is shown <strong>only once</strong>. Copy it now and store it in MacroDroid.
          If you lose it, you must delete and recreate this device.
        </p>
        <div class="token-display mb-4">{{ token }}</div>
        <button id="btn-copy-token" class="btn btn-primary w-full" @click="copyToken">
          {{ copied ? '✓ Copied!' : 'Copy Token' }}
        </button>
      </div>

      <!-- MacroDroid setup -->
      <div class="glass-card p-6">
        <h2 class="text-lg font-semibold mb-4">MacroDroid Setup</h2>

        <div class="space-y-4 text-sm" style="color: var(--color-text-muted);">
          <div class="p-4 rounded-xl" style="background: rgba(15, 23, 42, 0.5);">
            <h3 class="font-semibold mb-2" style="color: var(--color-text);">1. Trigger</h3>
            <p>Add a <strong>Timer → Interval Trigger</strong>. Set to your desired frequency (e.g., every 5 or 15 minutes).</p>
          </div>

          <div class="p-4 rounded-xl" style="background: rgba(15, 23, 42, 0.5);">
            <h3 class="font-semibold mb-2" style="color: var(--color-text);">2. Actions (in order)</h3>
            <ol class="list-decimal ml-4 space-y-2">
              <li>
                <strong>Location → Force Location Update</strong>
              </li>
              <li>
                <strong>Actions → JavaScript</strong> — paste the script below. Set output variable name to <code style="color: #86efac;">payload</code>.
              </li>
              <li>
                <strong>Applications → HTTP Request</strong>
                <ul class="list-disc ml-4 mt-1 space-y-1">
                  <li>Method: <strong>POST</strong></li>
                  <li>URL: <code style="color: #86efac;">{{ ingestUrl }}</code></li>
                  <li>Header: <code style="color: #86efac;">Authorization: Bearer {{ token }}</code></li>
                  <li>Header: <code style="color: #86efac;">Content-Type: application/json</code></li>
                  <li>Body: <code style="color: #86efac;">{payload}</code> (the variable from step 2)</li>
                  <li>Save response code to variable: <code style="color: #86efac;">http_status</code></li>
                </ul>
              </li>
              <li>
                <strong>If</strong> <code style="color: #86efac;">http_status</code> <strong>≠ 200</strong>:
                <ul class="list-disc ml-4 mt-1">
                  <li><strong>Variables → Set Variable</strong>: set <code style="color: #86efac;">retry_payload</code> = <code style="color: #86efac;">{payload}</code></li>
                </ul>
                <strong>Else</strong>:
                <ul class="list-disc ml-4 mt-1">
                  <li><strong>Variables → Set Variable</strong>: set <code style="color: #86efac;">retry_payload</code> = (empty string)</li>
                </ul>
              </li>
            </ol>
          </div>

          <div class="p-4 rounded-xl" style="background: rgba(15, 23, 42, 0.5);">
            <h3 class="font-semibold mb-2" style="color: var(--color-text);">3. JavaScript Code</h3>
            <p class="mb-2">Paste this into the JavaScript action:</p>
            <pre class="token-display text-xs overflow-x-auto whitespace-pre-wrap">{{ jsCode }}</pre>
            <button id="btn-copy-js" class="btn btn-ghost w-full mt-3" style="font-size: 0.8rem;" @click="copyJs">
              {{ copiedJs ? '✓ Copied!' : 'Copy JavaScript' }}
            </button>
          </div>

          <div class="p-4 rounded-xl" style="background: rgba(15, 23, 42, 0.5);">
            <h3 class="font-semibold mb-2" style="color: var(--color-text);">4. Permissions &amp; Battery</h3>
            <ul class="list-disc ml-4 space-y-1">
              <li>Grant MacroDroid <strong>Location (always)</strong> permission.</li>
              <li>Exempt MacroDroid from <strong>battery optimization</strong> (Settings → Apps → MacroDroid → Battery → Unrestricted).</li>
              <li>On some phones: disable <strong>Adaptive Battery</strong> for MacroDroid.</li>
            </ul>
          </div>
        </div>
      </div>

      <router-link to="/" class="btn btn-ghost w-full">← Back to Dashboard</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase, supabaseUrl } from '../lib/supabase.js'

const phoneName = ref('')
const token = ref('')
const error = ref('')
const creating = ref(false)
const step = ref('name')
const copied = ref(false)
const copiedJs = ref(false)

const ingestUrl = computed(() => `${supabaseUrl}/functions/v1/ingest`)

const jsCode = computed(() => {
  return `// Find Any Device – MacroDroid JavaScript action
// Builds location payload and handles offline retry.
var lat = getVar("loc_lat") || lm("latitude");
var lon = getVar("loc_lon") || lm("longitude");
var phoneName = "${phoneName.value.replace(/"/g, '\\"')}";
var ts = new Date().toISOString();

var point = {
  phone_name: phoneName,
  lat: parseFloat(lat),
  lon: parseFloat(lon),
  timestamp: ts
};

// Check for pending retry payload
var retry = getVar("retry_payload");
var payload;

if (retry && retry.length > 2) {
  try {
    var prev = JSON.parse(retry);
    if (Array.isArray(prev)) {
      prev.push(point);
      payload = prev;
    } else {
      payload = [prev, point];
    }
  } catch(e) {
    payload = point;
  }
} else {
  payload = point;
}

mdOutput(JSON.stringify(payload));`
})

async function createDevice() {
  error.value = ''
  if (!phoneName.value.trim()) {
    error.value = 'Please enter a device name'
    return
  }
  creating.value = true

  try {
    const { data, error: rpcErr } = await supabase.rpc('create_device', {
      p_phone_name: phoneName.value.trim(),
    })

    if (rpcErr) {
      error.value = rpcErr.message || 'Failed to create device'
      return
    }

    token.value = data.token
    step.value = 'token'
  } catch (e) {
    error.value = 'An unexpected error occurred'
  } finally {
    creating.value = false
  }
}

function copyToken() {
  navigator.clipboard.writeText(token.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function copyJs() {
  navigator.clipboard.writeText(jsCode.value)
  copiedJs.value = true
  setTimeout(() => { copiedJs.value = false }, 2000)
}
</script>
