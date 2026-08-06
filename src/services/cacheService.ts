// Cache service with IndexedDB persistence + memory cache
type CacheEntry<T> = {
    data: T
    timestamp: number
    ttl: number
}

type CacheMetadata = {
    key: string
    size: number
    lastAccessed: number
}

class CacheService {
    private memoryCache: Map<string, CacheEntry<unknown>> = new Map()
    private dbName = 'trackist-cache'
    private dbVersion = 1
    private db: IDBDatabase | null = null
    private initPromise: Promise<void> | null = null
    private maxMemoryEntries = 100

    constructor() {
        this.initPromise = this.initDB()
    }

    private async initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                this.db = request.result
                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' })
                    store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
                }
            }
        })
    }

    private async ensureDB(): Promise<IDBDatabase> {
        if (this.db) return this.db
        if (this.initPromise) await this.initPromise
        if (!this.db) throw new Error('IndexedDB not initialized')
        return this.db
    }

    private generateKey(type: string, identifier: string | number): string {
        return `${type}:${identifier}`
    }

    async get<T>(type: string, identifier: string | number): Promise<T | null> {
        const key = this.generateKey(type, identifier)

        // 1. Check memory cache first
        const memoryEntry = this.memoryCache.get(key)
        if (memoryEntry && this.isValid(memoryEntry)) {
            this.updateAccessTime(key)
            return memoryEntry.data as T
        }

        // 2. Check IndexedDB
        try {
            const db = await this.ensureDB()
            const entry = await this.idbGet<T>(db, key)
            if (entry && this.isValid(entry)) {
                // Promote to memory cache
                this.setMemoryCache(key, entry)
                this.updateAccessTime(key)
                return entry.data
            }
        } catch (err) {
            console.error('IndexedDB read error:', err)
        }

        return null
    }

    async set<T>(type: string, identifier: string | number, data: T, ttl: number): Promise<void> {
        const key = this.generateKey(type, identifier)
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl
        }

        // Update memory cache
        this.setMemoryCache(key, entry)

        // Update IndexedDB
        try {
            const db = await this.ensureDB()
            const metadata: CacheMetadata = {
                key,
                size: JSON.stringify(data).length,
                lastAccessed: Date.now()
            }
            await this.idbSet(db, { ...entry, ...metadata })
        } catch (err) {
            console.error('IndexedDB write error:', err)
        }
    }

    async staleWhileRevalidate<T>(
        type: string,
        identifier: string | number,
        fetcher: () => Promise<T>,
        ttl: number
    ): Promise<T> {
        // Return cached data immediately if available
        const cached = await this.get<T>(type, identifier)
        if (cached) {
            // Revalidate in background
            this.revalidate(type, identifier, fetcher, ttl).catch(() => {})
            return cached
        }

        // No cache, fetch fresh
        const fresh = await fetcher()
        await this.set(type, identifier, fresh, ttl)
        return fresh
    }

    private async revalidate<T>(
        type: string,
        identifier: string | number,
        fetcher: () => Promise<T>,
        ttl: number
    ): Promise<void> {
        try {
            const fresh = await fetcher()
            await this.set(type, identifier, fresh, ttl)
        } catch (err) {
            console.error('Background revalidation failed:', err)
        }
    }

    private setMemoryCache<T>(key: string, entry: CacheEntry<T>): void {
        // LRU eviction if memory cache is full
        if (this.memoryCache.size >= this.maxMemoryEntries) {
            const oldestKey = this.memoryCache.keys().next().value
            if (oldestKey) this.memoryCache.delete(oldestKey)
        }
        this.memoryCache.set(key, entry)
    }

    private updateAccessTime(key: string): void {
        try {
            const db = this.db
            if (!db) return
            const transaction = db.transaction('cache', 'readwrite')
            const store = transaction.objectStore('cache')
            const request = store.get(key)
            request.onsuccess = () => {
                const result = request.result
                if (result) {
                    result.lastAccessed = Date.now()
                    store.put(result)
                }
            }
        } catch {
            // Silent fail for access time updates
        }
    }

    private isValid<T>(entry: CacheEntry<T>): boolean {
        return Date.now() - entry.timestamp < entry.ttl
    }

    private async idbGet<T>(db: IDBDatabase, key: string): Promise<CacheEntry<T> | null> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('cache', 'readonly')
            const store = transaction.objectStore('cache')
            const request = store.get(key)

            request.onsuccess = () => {
                const result = request.result
                if (result) {
                    const { data, timestamp, ttl } = result
                    resolve({ data, timestamp, ttl } as CacheEntry<T>)
                } else {
                    resolve(null)
                }
            }
            request.onerror = () => reject(request.error)
        })
    }

    private async idbSet(db: IDBDatabase, entry: CacheEntry<unknown> & CacheMetadata): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('cache', 'readwrite')
            const store = transaction.objectStore('cache')
            const request = store.put(entry)

            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }

    async clear(): Promise<void> {
        // Clear memory cache
        this.memoryCache.clear()

        // Clear IndexedDB
        try {
            const db = await this.ensureDB()
            const transaction = db.transaction('cache', 'readwrite')
            const store = transaction.objectStore('cache')
            const request = store.clear()

            await new Promise<void>((resolve, reject) => {
                request.onsuccess = () => resolve()
                request.onerror = () => reject(request.error)
            })
        } catch (err) {
            console.error('Cache clear error:', err)
        }
    }

    async clearPattern(pattern: string): Promise<void> {
        // Clear memory cache entries matching pattern
        const keysToDelete: string[] = []
        for (const key of this.memoryCache.keys()) {
            if (key.includes(pattern)) {
                keysToDelete.push(key)
            }
        }
        keysToDelete.forEach(key => this.memoryCache.delete(key))

        // Clear IndexedDB entries matching pattern
        try {
            const db = await this.ensureDB()
            const transaction = db.transaction('cache', 'readwrite')
            const store = transaction.objectStore('cache')
            const request = store.getAllKeys()

            const keys = await new Promise<string[]>((resolve, reject) => {
                request.onsuccess = () => resolve(request.result as string[])
                request.onerror = () => reject(request.error)
            })

            const keysToDeleteDB = keys.filter(key => key.includes(pattern))
            
            await Promise.all(keysToDeleteDB.map(key => {
                return new Promise<void>((resolve, reject) => {
                    const deleteRequest = store.delete(key)
                    deleteRequest.onsuccess = () => resolve()
                    deleteRequest.onerror = () => reject(deleteRequest.error)
                })
            }))
        } catch (err) {
            console.error('Cache pattern clear error:', err)
        }
    }

    async getStats(): Promise<{ memoryEntries: number; dbEntries: number }> {
        const memoryEntries = this.memoryCache.size

        let dbEntries = 0
        try {
            const db = await this.ensureDB()
            const transaction = db.transaction('cache', 'readonly')
            const store = transaction.objectStore('cache')
            const request = store.count()

            dbEntries = await new Promise<number>((resolve, reject) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
        } catch (err) {
            console.error('Stats error:', err)
        }

        return { memoryEntries, dbEntries }
    }
}

// Singleton instance
export const cacheService = new CacheService()

// Helper function to invalidate cache for user-specific data
export async function invalidateUserCache(): Promise<void> {
    await cacheService.clearPattern('watchlist')
    await cacheService.clearPattern('library')
    await cacheService.clearPattern('library') // Clear library cache specifically
}

// Helper function for cached fetching
export async function getCachedOrFetch<T>(
    type: string,
    identifier: string | number,
    fetcher: () => Promise<T>,
    options: { ttl: number; staleWhileRevalidate?: boolean } = { ttl: 6 * 60 * 60 * 1000, staleWhileRevalidate: false }
): Promise<T> {
    if (options.staleWhileRevalidate) {
        return cacheService.staleWhileRevalidate(type, identifier, fetcher, options.ttl)
    }

    const cached = await cacheService.get<T>(type, identifier)
    if (cached) return cached

    const fresh = await fetcher()
    await cacheService.set(type, identifier, fresh, options.ttl)
    return fresh
}

// Clear cache utility
export async function clearAllCache(): Promise<void> {
    await cacheService.clear()
    
    // Also clear localStorage calendar cache
    try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('trackist-calendar:')) {
                keysToRemove.push(key)
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch (err) {
        console.error('localStorage clear error:', err)
    }
}

// Get cache stats
export async function getCacheStats() {
    return cacheService.getStats()
}
