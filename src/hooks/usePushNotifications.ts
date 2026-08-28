import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY?.trim()

const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

const isPwaContext = (): boolean =>
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error - iOS Safari specific property
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')

const isPushSupported = (): boolean =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const serviceWorkerReadyWithTimeout = (timeoutMs: number): Promise<ServiceWorkerRegistration> =>
    new Promise((resolve, reject) => {
        if (!('serviceWorker' in navigator)) {
            reject(new Error('Service workers are not supported'))
            return
        }
        const timeout = window.setTimeout(
            () => reject(new Error('Service worker not ready')),
            timeoutMs
        )
        navigator.serviceWorker.ready.then(
            (registration) => {
                window.clearTimeout(timeout)
                resolve(registration)
            },
            (error) => {
                window.clearTimeout(timeout)
                reject(error)
            }
        )
    })

export const usePushNotifications = () => {
    const [supported] = useState<boolean>(isPushSupported())
    const [inPwaContext] = useState<boolean>(isPwaContext())
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
        supported ? Notification.permission : 'unsupported'
    )
    const [serviceWorkerReady, setServiceWorkerReady] = useState(false)
    const [subscribed, setSubscribed] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!supported || !('serviceWorker' in navigator)) {
            return
        }

        let cancelled = false
        navigator.serviceWorker.ready
            .then((registration) => {
                if (cancelled) return
                setServiceWorkerReady(true)
                return registration.pushManager.getSubscription()
            })
            .then((subscription) => {
                if (!cancelled) setSubscribed(!!subscription)
            })
            .catch(() => {
                if (!cancelled) setSubscribed(false)
            })
        return () => {
            cancelled = true
        }
    }, [supported])

    const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setError(null)
        setLoading(true)

        try {
            if (!supported) {
                throw new Error('Push notifications are not supported on this browser')
            }

            if (!VAPID_PUBLIC_KEY) {
                throw new Error('Push notifications are not configured (missing VAPID key)')
            }

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                throw new Error('You must be signed in to enable notifications')
            }

            setPermission(Notification.permission)

            if (Notification.permission === 'denied') {
                throw new Error('Notifications are blocked for this site in browser settings')
            }

            if (Notification.permission !== 'granted') {
                const requestedPermission = await Notification.requestPermission()
                setPermission(requestedPermission)
                if (requestedPermission !== 'granted') {
                    throw new Error('Notification permission was not granted')
                }
            }

            const registration = await serviceWorkerReadyWithTimeout(10_000)
            setServiceWorkerReady(true)

            let subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                })
            }

            const subscriptionJson = subscription.toJSON()
            const endpoint = subscriptionJson.endpoint
            const keys = subscriptionJson.keys

            if (!endpoint || !keys?.p256dh || !keys.auth) {
                throw new Error('Could not read the push subscription details')
            }

            const { error: upsertError } = await supabase
                .from('push_subscriptions')
                .upsert(
                    {
                        user_id: user.id,
                        endpoint,
                        keys: {
                            p256dh: keys.p256dh,
                            auth: keys.auth,
                        },
                        user_agent: navigator.userAgent,
                        last_seen: new Date().toISOString(),
                    },
                    { onConflict: 'endpoint' }
                )

            if (upsertError) {
                throw new Error(`Failed to save the subscription: ${upsertError.message}`)
            }

            setSubscribed(true)
            return { ok: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to enable notifications'
            setError(message)
            return { ok: false, error: message }
        } finally {
            setLoading(false)
        }
    }, [supported])

    const disable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setError(null)
        setLoading(true)

        try {
            if (!supported || !('serviceWorker' in navigator)) {
                setSubscribed(false)
                return { ok: true }
            }

            const registration = await serviceWorkerReadyWithTimeout(10_000)
            const subscription = await registration.pushManager.getSubscription()

            if (subscription) {
                const endpoint = subscription.endpoint
                await subscription.unsubscribe()
                if (endpoint) {
                    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
                }
            }

            setSubscribed(false)
            return { ok: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to disable notifications'
            setError(message)
            return { ok: false, error: message }
        } finally {
            setLoading(false)
        }
    }, [supported])

    return {
        supported,
        inPwaContext,
        permission,
        serviceWorkerReady,
        subscribed,
        loading,
        error,
        enable,
        disable,
    }
}