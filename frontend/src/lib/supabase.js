import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return ''
  let cleaned = String(rawUrl).trim().replace(/^['"]+|['"]+$/g, '')
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`
  }
  try {
    const parsed = new URL(cleaned)
    // If user copied project dashboard URL e.g. https://supabase.com/dashboard/project/<ref>
    if (parsed.hostname.includes('supabase.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const projectIdx = parts.indexOf('project')
      if (projectIdx !== -1 && parts[projectIdx + 1]) {
        return `https://${parts[projectIdx + 1]}.supabase.co`
      }
    }
    // Return origin only (e.g. https://<ref>.supabase.co), stripping any trailing slashes or subpaths
    return parsed.origin
  } catch {
    return cleaned.replace(/\/+$/, '')
  }
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseUrl = normalizeSupabaseUrl(rawUrl)
const supabaseAnonKey = String(rawKey || '').trim().replace(/^['"]+|['"]+$/g, '')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export { supabaseUrl }
