import { App as CapacitorApp } from '@capacitor/app'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { isNativePlatform } from './nativePush'
import { installAppUpdate, type InstallAppUpdateInfo } from '../plugins/installAppUpdate'

export const ANDROID_APK_URL = 'https://github.com/Ph1lippus/Trackist/releases/download/android-latest/track1st.apk'
const RELEASE_API_URL = 'https://api.github.com/repos/Ph1lippus/Trackist/releases/tags/android-latest'

const DISMISS_KEY = 'track1st.native-update-dismissed'
const DISMISS_PERIOD_MS = 7 * 24 * 60 * 60 * 1000
const VERSION_CACHE_KEY = 'track1st.native-update-version'
const VERSION_CODE_CACHE_KEY = 'track1st.native-update-version-code'

interface DismissRecord {
    version: string
    at: number
}

export interface NativeVersionManifest {
    versionCode: number
    versionName: string
    apkUrl: string
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

export const getInstalledVersionCode = async (): Promise<number> => {
    try {
        const info = await CapacitorApp.getInfo()
        const build = Number(info.build ?? '0')
        return Number.isFinite(build) ? build : 0
    } catch {
        return 0
    }
}

export const getInstalledVersion = async (): Promise<string | null> => {
    try {
        const info = await CapacitorApp.getInfo()
        return info.version ?? info.build ?? null
    } catch {
        return null
    }
}

export const getLatestVersion = async (): Promise<string | null> => {
    try {
        const manifest = await getLatestVersionManifest()
        if (!manifest) return null
        localStorage.setItem(VERSION_CACHE_KEY, manifest.versionName)
        return manifest.versionName
    } catch {
        return localStorage.getItem(VERSION_CACHE_KEY)
    }
}

export const getLatestVersionManifest = async (): Promise<NativeVersionManifest | null> => {
    try {
        const res = await fetch(`${RELEASE_API_URL}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
        })

        if (!res.ok) return null

        const data = (await res.json()) as {
            body?: string
            assets?: { name?: string; browser_download_url?: string }[]
        }
        const versionName = data.body?.match(/VERSION=([^\s]+)/)?.[1] ?? ''
        const versionCode = Number(data.body?.match(/VERSION_CODE=(\d+)/)?.[1] ?? (1200 + Number(versionName.split('.').pop())))
        const apkUrl = data.assets?.find((asset) => asset.name === 'track1st.apk')?.browser_download_url ?? ANDROID_APK_URL

        if (!Number.isFinite(versionCode) || versionCode <= 0 || !versionName) return null

        localStorage.setItem(VERSION_CACHE_KEY, versionName)
        localStorage.setItem(VERSION_CODE_CACHE_KEY, String(versionCode))

        return {
            versionCode,
            versionName,
            apkUrl,
        }
    } catch {
        return null
    }
}

export const openUpdateDownload = async (): Promise<boolean> => {
    if (isNativePlatform()) {
        const manifest = await getLatestVersionManifest()
        if (!manifest) return false

        try {
            const download = await Filesystem.downloadFile({
                url: manifest.apkUrl,
                path: 'updates/track1st.apk',
                directory: Directory.Cache,
            })
            const installInfo: InstallAppUpdateInfo = {
                path: download.path ?? 'updates/track1st.apk',
                fileName: 'track1st.apk',
            }
            return await installAppUpdate(installInfo)
        } catch (error) {
            console.error('Failed to download or install the Android update:', error)
            return false
        }
    } else {
        window.open(ANDROID_APK_URL, '_blank')
        return true
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