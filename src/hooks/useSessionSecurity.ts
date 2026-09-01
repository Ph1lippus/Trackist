import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuthStore } from '../stores/useAuthStore'

export function useSessionSecurity() {
    const { session, user } = useAuthStore()
    const deviceFingerprintRef = useRef<string>('')
    const registeredSessionRef = useRef<string | null>(null)

    // Generate device fingerprint
    const generateFingerprint = useCallback(() => {
        if (deviceFingerprintRef.current) return deviceFingerprintRef.current

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.textBaseline = 'top'
            ctx.font = '14px Arial'
            ctx.fillText('fingerprint', 2, 2)
        }
        const canvasFp = canvas.toDataURL()
        const nav = navigator.userAgent
        const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const lang = navigator.language

        let hash = 0
        const str = canvasFp + nav + screen + timezone + lang
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }

        deviceFingerprintRef.current = Math.abs(hash).toString(36)
        return deviceFingerprintRef.current
    }, [])

    // Register device session
    const registerSession = useCallback(async () => {
        if (!session?.access_token || !user) return

        // Dedupe: only register once per distinct access token. The effect
        // re-runs on every session object change (auth store updates, token
        // refresh), which previously fired many concurrent register calls
        // and each crossed the server's check-then-insert -> duplicate rows.
        if (registeredSessionRef.current === session.access_token) return
        registeredSessionRef.current = session.access_token

        try {
            const fingerprint = generateFingerprint()
            await supabase.functions.invoke('device-fingerprint', {
                body: {
                    fingerprint,
                    user_agent: navigator.userAgent,
                    session_id: btoa(session.access_token).substring(0, 32)
                }
            })
        } catch (err) {
            console.warn('Failed to register session:', err)
        }
    }, [session, user, generateFingerprint])

    // Register the session when it becomes available. Session renewal (and its
    // durability) is handled by the Supabase client's built-in autoRefreshToken.
    useEffect(() => {
        if (!user || !session) return
        registerSession()
    }, [user, session, registerSession])

    // Return cleanup function for manual use
    return {
        registerSession
    }
}
