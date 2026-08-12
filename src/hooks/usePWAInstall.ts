import { useEffect, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'rejected'; platform: string }>
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [canInstall, setCanInstall] = useState(false)
    const [isPWA] = useState<boolean>(() => {
        return window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    })

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            setCanInstall(true)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        }
    }, [])

    const install = async (): Promise<boolean> => {
        if (!deferredPrompt) return false

        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        setDeferredPrompt(null)
        setCanInstall(false)
        return outcome === 'accepted'
    }

    return { canInstall, isPWA, install }
}
