import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MobileContext } from './MobileContext'

const MOBILE_QUERY = '(max-width: 767px)'

function getIsMobile(): boolean {
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia === 'function') {
        return window.matchMedia(MOBILE_QUERY).matches
    }
    return window.innerWidth < 768
}

export const MobileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isMobile, setIsMobile] = useState(getIsMobile)

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

        const mql = window.matchMedia(MOBILE_QUERY)
        const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mql.addEventListener('change', handleChange)
        setIsMobile(mql.matches)
        return () => mql.removeEventListener('change', handleChange)
    }, [])

    const mobileValue = useMemo(() => ({ isMobile }), [isMobile])

    return (
        <MobileContext.Provider value={mobileValue}>
            {children}
        </MobileContext.Provider>
    )
}
