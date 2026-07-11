import React, { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
    { path: '/', label: 'Home', icon: 'fa-solid fa-house' },
    { path: '/discover', label: 'Discover', icon: 'fa-solid fa-compass' },
    { path: '/watchlist', label: 'Watchlist', icon: 'fa-solid fa-play' },
    { path: '/more', label: 'More', icon: 'fa-solid fa-bars' },
]

const BottomNav: React.FC = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const pillRef = useRef<HTMLSpanElement>(null)
    const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map())
    const didInit = useRef(false)

    const activePath = TABS.find(t => location.pathname === t.path)?.path ?? '/'

    const syncPill = useCallback((tab: HTMLButtonElement, instant = false) => {
        const pill = pillRef.current
        if (!pill) return
        if (instant) {
            pill.style.transition = 'none'
            pill.style.transform = `translateX(${tab.offsetLeft}px)`
            pill.style.width = `${tab.offsetWidth}px`
            // Force reflow
            void pill.offsetHeight
            pill.style.transition = ''
        } else {
            pill.style.transform = `translateX(${tab.offsetLeft}px)`
            pill.style.width = `${tab.offsetWidth}px`
        }
    }, [])

    // On first paint and resize, snap pill instantly without animation
    useEffect(() => {
        const tab = tabsRef.current.get(activePath)
        if (tab) {
            syncPill(tab, !didInit.current)
            didInit.current = true
        }

        const onResize = () => {
            const t = tabsRef.current.get(activePath)
            if (t) syncPill(t, true)
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [activePath, syncPill])

    // Animate to new position when activePath changes
    useEffect(() => {
        const tab = tabsRef.current.get(activePath)
        if (tab && didInit.current) {
            syncPill(tab, false)
        }
    }, [activePath, syncPill])

    const handleTabClick = (path: string) => {
        navigate(path)
    }

    return (
        <div className="t-tabs bottom-nav" role="tablist" aria-label="Bottom navigation">
            <span className="t-tabs-pill" aria-hidden="true" ref={pillRef}></span>
            {TABS.map(({ path, label, icon }) => (
                <button
                    key={path}
                    className="t-tab"
                    role="tab"
                    aria-selected={activePath === path}
                    ref={el => {
                        if (el) tabsRef.current.set(path, el)
                        else tabsRef.current.delete(path)
                    }}
                    onClick={() => handleTabClick(path)}
                >
                    <i className={icon}></i>
                    <small>{label}</small>
                </button>
            ))}
        </div>
    )
}

export default BottomNav
