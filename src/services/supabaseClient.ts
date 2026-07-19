import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL in environment variables')
}

if (!supabaseKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)