import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import type { VirtuosoHandle } from 'react-virtuoso'

// Store scroll positions in memory (Map) keyed by route path
const scrollPositions = new Map<string, number>()

export function useScrollRestoration() {
    const location = useLocation()
    const path = location.pathname
    const virtuosoRef = useRef<VirtuosoHandle | null>(null)
    const isRestoringRef = useRef(false)

    // Restore scroll position on mount
    useEffect(() => {
        isRestoringRef.current = true
        
        // Small delay to ensure content is rendered
        const timer = setTimeout(() => {
            const savedPosition = scrollPositions.get(path)
            if (savedPosition !== undefined && virtuosoRef.current) {
                virtuosoRef.current.scrollToIndex({
                    index: Math.floor(savedPosition / 100), // Approximate index based on scroll position
                    behavior: 'auto'
                })
            } else if (savedPosition !== undefined) {
                window.scrollTo(0, savedPosition)
            }
            isRestoringRef.current = false
        }, 100)

        return () => clearTimeout(timer)
    }, [path])

    // Save scroll position on unmount or before navigation
    useEffect(() => {
        const handleScroll = () => {
            if (!isRestoringRef.current) {
                scrollPositions.set(path, window.scrollY)
            }
        }

        // Save on scroll (throttled)
        let timeout: ReturnType<typeof setTimeout>
        const throttledSave = () => {
            clearTimeout(timeout)
            timeout = setTimeout(handleScroll, 200)
        }

        window.addEventListener('scroll', throttledSave, { passive: true })

        // Save before unload
        const handleBeforeUnload = () => {
            scrollPositions.set(path, window.scrollY)
        }
        window.addEventListener('beforeunload', handleBeforeUnload)

        return () => {
            window.removeEventListener('scroll', throttledSave)
            window.removeEventListener('beforeunload', handleBeforeUnload)
            clearTimeout(timeout)
            // Save final position
            scrollPositions.set(path, window.scrollY)
        }
    }, [path])

    return {
        virtuosoRef,
        getScrollPosition: () => scrollPositions.get(path),
        clearScrollPosition: () => scrollPositions.delete(path)
    }
}
