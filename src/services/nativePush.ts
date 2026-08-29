import { Capacitor } from '@capacitor/core'
import {
    PushNotifications,
    type PushNotificationSchema,
} from '@capacitor/push-notifications'

const LOG_URL = 'https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/push-log'
const TOKEN_TIMEOUT_MS = 15000

export type NativePermissionState = 'prompt' | 'denied' | 'granted'

const mapPermission = (state: string): NativePermissionState => {
    if (state === 'denied' || state === 'granted' || state === 'prompt') return state
    return 'prompt'
}

const report = (status: string, detail?: string): void => {
    void fetch(LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, detail, platform: 'native', at: new Date().toISOString() }),
    }).catch(() => {})
}

let initialized = false
let registeredToken: string | null = null

export const isNativePlatform = (): boolean => {
    try {
        return Capacitor.isNativePlatform()
    } catch {
        return false
    }
}

export const initNativePush = (): void => {
    if (initialized || !isNativePlatform()) return
    initialized = true

    PushNotifications.createChannel({
        id: 'push_notifications',
        name: 'Track1st',
        description: 'Track1st release alerts',
        importance: 4,
        lights: true,
        vibration: true,
    }).catch(() => {})

    PushNotifications.addListener('registration', (data) => {
        registeredToken = data.value
        report('native_registration', data.value.slice(-20))
    })

    PushNotifications.addListener('registrationError', (err) => {
        report('native_registration_error', String(err?.error ?? err))
    })

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        report('native_received', JSON.stringify(notification.data ?? {}))
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const url = String(action.notification.data?.url ?? '/')
        report('native_action', url)
        window.dispatchEvent(new CustomEvent('track1st:navigate', { detail: { url } }))
    })

    report('native_init')
}

export const getNativePermission = async (): Promise<NativePermissionState> => {
    try {
        const result = await PushNotifications.checkPermissions()
        return mapPermission(result.receive)
    } catch {
        return 'prompt'
    }
}

export const requestNativePermission = async (): Promise<NativePermissionState> => {
    try {
        const result = await PushNotifications.requestPermissions()
        return mapPermission(result.receive)
    } catch {
        return 'denied'
    }
}

export const getNativeToken = (): Promise<string> => {
    if (registeredToken) return Promise.resolve(registeredToken)

    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timed out waiting for FCM token'))
        }, TOKEN_TIMEOUT_MS)

        const onRegistration = (data: { value: string }): void => {
            clearTimeout(timer)
            registeredToken = data.value
            resolve(data.value)
        }
        const onError = (err: { error?: string }): void => {
            clearTimeout(timer)
            reject(new Error(err?.error ?? 'FCM registration failed'))
        }

        void PushNotifications.addListener('registration', onRegistration)
        void PushNotifications.addListener('registrationError', onError)
        setTimeout(() => {
            void PushNotifications.register()
        }, 0)
    })
}

export const unregisterNative = async (): Promise<void> => {
    if (!isNativePlatform()) return
    await PushNotifications.unregister()
    registeredToken = null
}