import { App as CapacitorApp } from '@capacitor/app'
import { isNativePlatform } from './nativePush'

export const ANDROID_APK_URL = 'https://track1st.vercel.app/track1st.apk'

const LATEST_RELEASE_URL = 'https://api.github.com/repos/Ph1lippus/Trackist/releases/tags/android-latest'
const DISMISS_KEY = 'track1st.native-update-dismissed'
const DISMISS_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

interface DismissRecord {
    version: string
    at: number
}

export const isNewerVersion = (latest: string, current: string): boolean => {
    const parse = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0)
    const a = parse(latest)
    const b = parse(current)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0
        const y = b[i] ?? 0
        if (x !== y) return x > y
    }
    return false
}

export const getInstalledVersion = async (): Promise<string | null> => {
    try {
        const info = await CapacitorApp.getInfo()
        return info.version ?? null
    } catch {
        return null
    }
}

export const getLatestVersion = async (): Promise<string | null> => {
    try {
        const res = await fetch(LATEST_RELEASE_URL, {
            headers: { Accept: 'application/vnd.github+json' },
        })
        if (!res.ok) return null
        const data = await res.json()
        const notes = typeof data.body === 'string' ? data.body : ''
        const match = notes.match(/^VERSION=(\d+\.\d+(?:\.\d+)?)/m)
        return match ? match[1] : null
    } catch {
        return null
    }
}

export const openUpdateDownload = (): void => {
    if (isNativePlatform()) {
        window.open(ANDROID_APK_URL, '_system', 'noopener,noreferrer')
    } else {
        window.open(ANDROID_APK_URL, '_blank')
    }
}

export const getUpdateDismissed = (version: string): boolean => {
    try {
        const raw = localStorage.getItem(DISMISS_KEY)
        if (!raw) return false
        const rec = JSON.parse(raw) as DismissRecord
        return rec.version === version && Date.now() - rec.at < DISMISS_PERIOD_MS
    } catch {
        return false
    }
}

export const dismissUpdateVersion = (version: string): void => {
    try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify({ version, at: Date.now() }))
    } catch {
        // ignore storage failures
    }
}