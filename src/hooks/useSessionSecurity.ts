import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuthStore } from '../stores/useAuthStore'

export function useSessionSecurity() {
    const { session, user } = useAuthStore()
    const refreshIntervalRef = useRef<number | null>(null)
    const inactivityTimerRef = useRef<number | null>(null)
    const lastActivityRef = useRef<number>(Date.now())
    const deviceFingerprintRef = useRef<string>('')

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

    // Auto-refresh session 5 minutes before expiry
    const startAutoRefresh = useCallback(() => {
        if (refreshIntervalRef.current) return

        refreshIntervalRef.current = window.setInterval(async () => {
            if (!session) return

            try {
                const { data, error } = await supabase.auth.refreshSession()
                if (error) {
                    console.warn('Session refresh failed:', error)
                } else if (data.session) {
                    console.log('Session refreshed successfully')
                }
            } catch (err) {
                console.warn('Session refresh error:', err)
            }
        }, 5 * 60 * 1000) // Check every 5 minutes
    }, [session])

    // Inactivity timeout (30 minutes)
    const resetInactivityTimer = useCallback(() => {
        lastActivityRef.current = Date.now()

        if (inactivityTimerRef.current) {
            window.clearTimeout(inactivityTimerRef.current)
        }

        inactivityTimerRef.current = window.setTimeout(async () => {
            try {
                await supabase.auth.signOut()
                window.location.href = '/login'
            } catch (err) {
                console.warn('Inactivity signout failed:', err)
            }
        }, 30 * 60 * 1000) // 30 minutes
    }, [])

    // Track activity
    const handleActivity = useCallback(() => {
        resetInactivityTimer()
    }, [resetInactivityTimer])

    useEffect(() => {
        if (!user || !session) {
            // Cleanup when not authenticated
            if (refreshIntervalRef.current) {
                window.clearInterval(refreshIntervalRef.current)
                refreshIntervalRef.current = null
            }
            if (inactivityTimerRef.current) {
                window.clearTimeout(inactivityTimerRef.current)
                inactivityTimerRef.current = null
            }
            return
        }

        // Register session
        registerSession()

        // Start auto-refresh
        startAutoRefresh()

        // Start inactivity timer
        resetInactivityTimer()

        // Add activity listeners
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
        events.forEach(event => {
            document.addEventListener(event, handleActivity, { passive: true })
        })

        // Handle visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetInactivityTimer()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Cleanup
        return () => {
            events.forEach(event => {
                document.removeEventListener(event, handleActivity)
            })
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            
            if (refreshIntervalRef.current) {
                window.clearInterval(refreshIntervalRef.current)
                refreshIntervalRef.current = null
            }
            if (inactivityTimerRef.current) {
                window.clearTimeout(inactivityTimerRef.current)
                inactivityTimerRef.current = null
            }
        }
    }, [user, session, registerSession, startAutoRefresh, resetInactivityTimer, handleActivity])

    // Return cleanup function for manual use
    return {
        registerSession,
        resetInactivityTimer
    }
}