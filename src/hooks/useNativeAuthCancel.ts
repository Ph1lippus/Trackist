import { useEffect, useRef, type RefObject } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { supabase } from '../services/supabaseClient'
import { isNativePlatform } from '../services/nativePush'

// Long enough for the OAuth deep link to be delivered and the auth code
// exchanged. Without a session by then, the user almost certainly dismissed
// the Custom Tab instead of completing the flow.
const SETTLE_MS = 1500

/**
 * Recovers a native Google sign-in that the user walked away from.
 *
 * `signInWithGoogle` hands off to a Custom Tab, so the page that set a
 * `loading` flag before the call has no way of learning the outcome: a
 * successful sign-in navigates away, but a dismissed tab returns to the same
 * screen with `loading` still true and the button permanently disabled.
 *
 * While `pendingRef` is true this watches for the app returning to the
 * foreground and, if no session exists by then, invokes `onCancel` exactly
 * once. Screens that also drive `loading` for password sign-in leave the ref
 * false, so backgrounding the app mid-request does not clear their state.
 */
export const useNativeAuthCancel = (
    pendingRef: RefObject<boolean>,
    onCancel: () => void,
): void => {
    // Held in a ref so a new inline callback on every render does not tear the
    // native listener down and set it back up.
    const onCancelRef = useRef(onCancel)
    useEffect(() => {
        onCancelRef.current = onCancel
    }, [onCancel])

    useEffect(() => {
        if (!isNativePlatform()) return

        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (!isActive || settled || !pendingRef.current) return
            if (timer) clearTimeout(timer)

            timer = setTimeout(() => {
                if (settled || !pendingRef.current) return
                void supabase.auth.getSession().then(({ data }) => {
                    if (settled || data.session) return
                    settled = true
                    pendingRef.current = false
                    onCancelRef.current()
                })
            }, SETTLE_MS)
        })

        return () => {
            settled = true
            if (timer) clearTimeout(timer)
            void handle.then((listener) => listener.remove())
        }
    }, [pendingRef])
}