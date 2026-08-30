import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { isNativePlatform } from './nativePush'

export const ANDROID_APK_URL = 'https://github.com/Ph1lippus/Trackist/releases/download/android-latest/track1st.apk'

const LATEST_RELEASE_URL = 'https://api.github.com/repos/Ph1lippus/Trackist/releases/tags/android-latest'
const DISMISS_KEY = 'track1st.native-update-dismissed'
const DISMISS_PERIOD_MS = 7 * 24 * 60 * 60 * 1000
const ETAG_KEY = 'track1st.native-update-etag'
const VERSION_CACHE_KEY = 'track1st.native-update-version'

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
        const etag = localStorage.getItem(ETAG_KEY) || ''
        const res = await fetch(LATEST_RELEASE_URL, {
            headers: {
                Accept: 'application/vnd.github+json',
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
        })

        if (res.status === 304) {
            return localStorage.getItem(VERSION_CACHE_KEY)
        }
        if (!res.ok) return null

        const data = await res.json()
        const notes = typeof data.body === 'string' ? data.body : ''
        const match = notes.match(/^VERSION=(\d+\.\d+(?:\.\d+)?)/m)
        const version = match ? match[1] : null

        const newEtag = res.headers.get('etag')
        if (newEtag) {
            localStorage.setItem(ETAG_KEY, newEtag)
            if (version) localStorage.setItem(VERSION_CACHE_KEY, version)
        }
        return version
    } catch {
        return null
    }
}

export const openUpdateDownload = async (): Promise<void> => {
    if (isNativePlatform()) {
        await Browser.open({ url: ANDROID_APK_URL })
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