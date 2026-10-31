<template>
  <div class="flex items-center justify-center" style="min-height: 80vh;">
    <div class="glass-card p-8 w-full animate-fade-in" style="max-width: 420px;">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6);">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <h1 class="text-2xl font-bold mb-1">Find Any Device</h1>
        <p style="color: var(--color-text-muted); font-size: 0.875rem;">Sign in to track your devices</p>
      </div>

      <form id="login-form" @submit.prevent="handleLogin" class="flex flex-col gap-4">
        <div>
          <label for="identifier" class="block text-sm font-medium mb-1.5" style="color: var(--color-text-muted);">Email or Username</label>
          <input
            id="identifier"
            v-model="identifier"
            type="text"
            class="input"
            placeholder="name@example.com or username"
            autocomplete="username email"
            required
          />
        </div>
        <div>
          <label for="password" class="block text-sm font-medium mb-1.5" style="color: var(--color-text-muted);">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="input"
            placeholder="••••••••"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="showMfa" class="animate-fade-in">
          <label for="totp" class="block text-sm font-medium mb-1.5" style="color: var(--color-text-muted);">TOTP Code</label>
          <input
            id="totp"
            v-model="totpCode"
            type="text"
            class="input"
            placeholder="123456"
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="6"
          />
        </div>

        <div v-if="error" class="text-sm py-2 px-3 rounded-lg" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5;">
          {{ error }}
        </div>

        <button
          id="btn-login"
          type="submit"
          class="btn btn-primary w-full mt-2"
          :disabled="loading"
          style="padding: 0.75rem;"
        >
          <span v-if="loading" class="spinner" style="width: 1.25rem; height: 1.25rem; border-width: 2px;"></span>
          <span v-else>{{ showMfa ? 'Verify' : 'Sign In' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'

const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'findanydevice.local'

const router = useRouter()
const identifier = ref('')
const password = ref('')
const totpCode = ref('')
const error = ref('')
const loading = ref(false)
const showMfa = ref(false)
let mfaChallengeId = null

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    if (showMfa.value && mfaChallengeId) {
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaChallengeId.factorId,
        challengeId: mfaChallengeId.challengeId,
        code: totpCode.value,
      })
      if (verifyErr) {
        error.value = 'Invalid TOTP code'
        return
      }
      router.push({ name: 'Dashboard' })
      return
    }

    const trimmed = identifier.value.trim()
    const email = trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${EMAIL_DOMAIN}`

    const { data, error: loginErr } = await supabase.auth.signInWithPassword({
      email,
      password: password.value,
    })

    if (loginErr) {
      error.value = loginErr.message || 'Invalid username/email or password'
      return
    }

    // Check for MFA
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totpFactors = factors?.totp?.filter(f => f.status === 'verified') || []

    if (totpFactors.length > 0) {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: totpFactors[0].id,
      })
      if (challengeErr) {
        error.value = 'MFA challenge failed'
        return
      }
      mfaChallengeId = { factorId: totpFactors[0].id, challengeId: challenge.id }
      showMfa.value = true
      return
    }

    router.push({ name: 'Dashboard' })
  } catch (e) {
    error.value = 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}
</script>
