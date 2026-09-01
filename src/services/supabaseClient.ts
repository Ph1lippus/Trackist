import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL in environment variables')
}

if (!supabaseKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment variables')
}

// On native (Android/Capacitor) builds, localStorage can be cleared by the OS or
// WebView, which silently drops the Supabase refresh token and forces users to
// log in again. Use @capacitor/preferences (durable native storage) instead.
// On the web/PWA the default localStorage remains in use.
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()

const nativeStorage: SupportedStorage = {
    getItem: async (key) => {
        const { value } = await Preferences.get({ key })
        return value ?? null
    },
    setItem: async (key, value) => {
        await Preferences.set({ key, value })
    },
    removeItem: async (key) => {
        await Preferences.remove({ key })
    },
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(isNative ? { storage: nativeStorage } : {}),
    },
})
