import { useState, useEffect } from 'react'
import { clearAllCache, getCacheStats } from '../services/cacheService'

export function useCache() {
    const [stats, setStats] = useState<{ memoryEntries: number; dbEntries: number }>({ memoryEntries: 0, dbEntries: 0 })
    const [isClearing, setIsClearing] = useState(false)

    const refreshStats = async () => {
        const newStats = await getCacheStats()
        setStats(newStats)
    }

    const clearCache = async () => {
        setIsClearing(true)
        try {
            await clearAllCache()
            await refreshStats()
            return true
        } catch (err) {
            console.error('Failed to clear cache:', err)
            return false
        } finally {
            setIsClearing(false)
        }
    }

    useEffect(() => {
        const load = async () => {
            await refreshStats()
        }
        load()
    }, [])

    return {
        stats,
        clearCache,
        refreshStats,
        isClearing
    }
}