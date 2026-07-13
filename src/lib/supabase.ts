import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until .env is filled in — the app shows a setup notice instead of crashing. */
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url ?? 'https://not-configured.supabase.co',
  anonKey ?? 'not-configured',
)
