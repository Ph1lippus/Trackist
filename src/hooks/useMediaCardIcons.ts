import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'trackist-show-media-card-icons'

export function useMediaCardIcons() {
    const [showIcons, setShowIcons] = useState<boolean>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw === null) return false
            return raw === '1'
        } catch {
            return false
        }
    })

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, showIcons ? '1' : '0')
        } catch {
            // Storage unavailable — fail silently
        }
    }, [showIcons])

    const toggle = useCallback(() => {
        setShowIcons(prev => !prev)
    }, [])

    return { showIcons, toggle }
}
