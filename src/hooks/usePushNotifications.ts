import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import {
    isNativePlatform,
    getNativePermission,
    requestNativePermission,
    getNativeToken,
    unregisterNative,
} from '../services/nativePush'

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

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
    'Europe/Lisbon': 'PT',
    'Europe/London': 'GB',
    'Europe/Madrid': 'ES',
    'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE',
    'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL',
    'Europe/Brussels': 'BE',
    'Europe/Vienna': 'AT',
    'Europe/Zurich': 'CH',
    'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO',
    'Europe/Copenhagen': 'DK',
    'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL',
    'Europe/Prague': 'CZ',
    'Europe/Budapest': 'HU',
    'Europe/Bucharest': 'RO',
    'Europe/Sofia': 'BG',
    'Europe/Athens': 'GR',
    'Europe/Dublin': 'IE',
    'Europe/Belgrade': 'RS',
    'Europe/Zagreb': 'HR',
    'Europe/Ljubljana': 'SI',
    'Europe/Bratislava': 'SK',
    'Europe/Vilnius': 'LT',
    'Europe/Riga': 'LV',
    'Europe/Tallinn': 'EE',
    'Europe/Moscow': 'RU',
    'Europe/Istanbul': 'TR',
    'America/New_York': 'US',
    'America/Chicago': 'US',
    'America/Denver': 'US',
    'America/Los_Angeles': 'US',
    'America/Anchorage': 'US',
    'America/Toronto': 'CA',
    'America/Vancouver': 'CA',
    'America/Mexico_City': 'MX',
    'America/Sao_Paulo': 'BR',
    'America/Argentina/Buenos_Aires': 'AR',
    'America/Santiago': 'CL',
    'America/Lima': 'PE',
    'America/Bogota': 'CO',
    'America/Caracas': 'VE',
    'Asia/Tokyo': 'JP',
    'Asia/Shanghai': 'CN',
    'Asia/Hong_Kong': 'HK',
    'Asia/Singapore': 'SG',
    'Asia/Seoul': 'KR',
    'Asia/Taipei': 'TW',
    'Asia/Bangkok': 'TH',
    'Asia/Kuala_Lumpur': 'MY',
    'Asia/Jakarta': 'ID',
    'Asia/Manila': 'PH',
    'Asia/Ho_Chi_Minh': 'VN',
    'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA',
    'Asia/Jerusalem': 'IL',
    'Asia/Tehran': 'IR',
    'Asia/Kolkata': 'IN',
    'Australia/Sydney': 'AU',
    'Australia/Melbourne': 'AU',
    'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU',
    'Australia/Adelaide': 'AU',
    'Pacific/Auckland': 'NZ',
    'Pacific/Fiji': 'FJ',
    'Africa/Johannesburg': 'ZA',
    'Africa/Lagos': 'NG',
    'Africa/Cairo': 'EG',
    'Africa/Nairobi': 'KE',
}

const detectTimezone = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
        return 'UTC'
    }
}

const detectCountryFromTimezone = (timezone: string): string => {
    return TIMEZONE_TO_COUNTRY[timezone] || 'US'
}

const saveTimezoneAndCountry = async (userId: string): Promise<void> => {
    const timezone = detectTimezone()
    const countryCode = detectCountryFromTimezone(timezone)
    await supabase.from('profiles').update({ timezone, country_code: countryCode }).eq('id', userId)
}

export const usePushNotifications = () => {
    const native = isNativePlatform()
    const [supported] = useState<boolean>(native || isPushSupported())
    const [inPwaContext] = useState<boolean>(native || isPwaContext())
    const [permission, setPermission] = useState<NotificationPermission | 'prompt' | 'unsupported'>(() => {
        if (native) return 'prompt'
        return supported ? Notification.permission : 'unsupported'
    })
    const [serviceWorkerReady, setServiceWorkerReady] = useState(false)
    const [subscribed, setSubscribed] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (native) {
            let cancelled = false

            void getNativePermission().then((perm) => {
                if (!cancelled) setPermission(perm)
            })

            void supabase.auth.getUser().then(({ data: { user } }) => {
                if (!user) return null
                return supabase
                    .from('push_subscriptions')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('platform', 'native')
                    .maybeSingle()
            }).then((result) => {
                if (!cancelled && result?.data) setSubscribed(true)
            }).catch(() => {})

            return () => {
                cancelled = true
            }
        }

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
    }, [native, supported])

    const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setError(null)
        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                throw new Error('You must be signed in to enable notifications')
            }

            if (native) {
                let perm = await getNativePermission()
                setPermission(perm)
                if (perm === 'denied') {
                    throw new Error('Notifications are blocked for the app in your device settings')
                }
                if (perm !== 'granted') {
                    perm = await requestNativePermission()
                    setPermission(perm)
                    if (perm !== 'granted') {
                        throw new Error('Notification permission was not granted')
                    }
                }

                const token = await getNativeToken()

                const { error: upsertError } = await supabase
                    .from('push_subscriptions')
                    .upsert(
                        {
                            user_id: user.id,
                            platform: 'native',
                            token,
                            user_agent: navigator.userAgent,
                            last_seen: new Date().toISOString(),
                        },
                        { onConflict: 'token' }
                    )

                if (upsertError) {
                    throw new Error(`Failed to save the subscription: ${upsertError.message}`)
                }

                await saveTimezoneAndCountry(user.id)

                setSubscribed(true)
                return { ok: true }
            }

            if (!supported) {
                throw new Error('Push notifications are not supported on this browser')
            }

            if (!VAPID_PUBLIC_KEY) {
                throw new Error('Push notifications are not configured (missing VAPID key)')
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

            await saveTimezoneAndCountry(user.id)

            setSubscribed(true)
            return { ok: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to enable notifications'
            setError(message)
            return { ok: false, error: message }
        } finally {
            setLoading(false)
        }
    }, [native, supported])

    const disable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setError(null)
        setLoading(true)

        try {
            if (native) {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) throw new Error('You must be signed in to disable notifications')

                await unregisterNative().catch(() => {})

                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('platform', 'native')

                setSubscribed(false)
                return { ok: true }
            }

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
    }, [native, supported])

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