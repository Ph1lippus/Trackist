import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'
import { invalidateUserCache } from '../services/cacheService'
import { cacheService } from '../services/cacheService'
import type { WatchlistItem } from '../types'

// Extend WatchlistItem to include calculated progress field
interface TVShowWithProgress extends WatchlistItem {
    total_episodes_watched: number
}

interface LibraryState {
    // Core data arrays
    allItems: WatchlistItem[]
    tvShows: TVShowWithProgress[]
    movies: WatchlistItem[]
    finished: WatchlistItem[]
    
    // Derived set of tmdb_ids for quick membership checks
    watchlistIds: Set<number>
    
    // Loading states
    isLoading: boolean
    isInitialized: boolean
    
    // Error state
    error: string | null
    
    // Actions
    fetchInitialLibrary: (userId: string) => Promise<void>
    initialize: () => Promise<void>
    updateStatus: (id: string, nextStatus: WatchlistItem['status']) => Promise<void>
    updateItem: (id: string, updates: Partial<WatchlistItem>) => Promise<void>
    removeItem: (id: string) => Promise<void>
    addItem: (item: WatchlistItem) => Promise<void>
    refreshItem: (id: string) => Promise<void>
    syncWatchlistIds: () => void
    reset: () => void
}

const selectColumns = '*'

// Helper: compute a Set of tmdb_ids from an array of items
const computeWatchlistIds = (items: WatchlistItem[]): Set<number> =>
    new Set(items.map(item => item.tmdb_id).filter((id): id is number => id != null))

export const useLibraryStore = create<LibraryState>((set, get) => ({
    // Initial state
    allItems: [],
    tvShows: [],
    movies: [],
    finished: [],
    watchlistIds: new Set<number>(),
    isLoading: false,
    isInitialized: false,
    error: null,

    // Fetch entire library once at boot
    fetchInitialLibrary: async (userId: string) => {
        if (!userId) {
            console.error('No userId provided to fetchInitialLibrary')
            return
        }

        if (get().isInitialized) {
            return // Already loaded
        }

        set({ isLoading: true, error: null })

        try {
            console.log('Fetching library for user:', userId)
            
            // Try to get from cache first
            const cachedData = await cacheService.get<WatchlistItem[]>('library', userId)
            
            let items: WatchlistItem[] = []
            
            if (cachedData) {
                console.log('Using cached library data')
                items = cachedData
                // Revalidate in background with fresh data
                ;(async () => {
                    try {
                        const { data, error } = await supabase
                            .from('watchlist')
                            .select(selectColumns)
                            .eq('user_id', userId)
                            .order('updated_at', { ascending: false })
                        if (!error && data) {
                            await cacheService.set('library', userId, data, 5 * 60 * 1000)
                        }
                    } catch (err) {
                        console.error('Background revalidation failed:', err)
                    }
                })()
            } else {
                console.log('Fetching fresh library data from database')
                const { data, error } = await supabase
                    .from('watchlist')
                    .select(selectColumns)
                    .eq('user_id', userId)
                    .order('updated_at', { ascending: false })

                if (error) {
                    console.error('Supabase error details:', {
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                        code: error.code,
                        fullError: error
                    })
                    // Don't throw, just log and continue with empty array
                    // This prevents the 400 error from breaking the app
                } else {
                    items = data || []
                    // Cache the fresh data with short TTL (5 minutes) since users expect fresh data
                    await cacheService.set('library', userId, items, 5 * 60 * 1000)
                }
            }

            console.log('Fetched items:', items.length)

            // Categorize items by status and media type
            const tvShows: TVShowWithProgress[] = []
            const movies: WatchlistItem[] = []
            const finished: WatchlistItem[] = []

            items.forEach(item => {
                // Add to finished if status is completed or caught_up
                if (item.status === 'completed' || item.status === 'caught_up') {
                    finished.push(item)
                }
                
                // Categorize by media type
                if (item.media_type === 'tv' || item.media_type === 'anime') {
                    tvShows.push({
                        ...item,
                        total_episodes_watched: 0 // Will be calculated on demand
                    } as TVShowWithProgress)
                } else if (item.media_type === 'movie') {
                    movies.push(item)
                }
            })

            // Sort finished array by completed_at, falling back to updated_at (most recent first)
            finished.sort((a, b) => {
                const dateA = new Date(a.completed_at || a.updated_at || 0)
                const dateB = new Date(b.completed_at || b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            // Sort tvShows array by updated_at (most recent first)
            tvShows.sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            // Sort movies array by updated_at (most recent first)
            movies.sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            set({
                allItems: items,
                tvShows,
                movies,
                finished,
                watchlistIds: computeWatchlistIds(items),
                isLoading: false,
                isInitialized: true
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load library'
            console.error('Failed to fetch initial library:', error)
            set({
                error: errorMessage,
                isLoading: false,
                isInitialized: false
            })
        }
    },

    // Optimistic update for status changes
    updateStatus: async (id: string, nextStatus: WatchlistItem['status']) => {
        const state = get()
        
        // Invalidate cache for this status change
        cacheService.clearPattern('library')
        cacheService.clearPattern('watchlist')
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update - update all arrays immediately
        const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
            items.map(item => item.id === id ? {
                ...item,
                status: nextStatus,
                updated_at: new Date().toISOString(),
                ...(nextStatus === 'completed' ? { completed_at: new Date().toISOString() } : {})
            } : item)

        const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
        const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]
        const newMovies = updateInArray(state.movies) as WatchlistItem[]
        
        // Handle finished array - move item in/out based on status
        const isFinishedStatus = nextStatus === 'completed' || nextStatus === 'caught_up'
        let newFinished = state.finished
        if (isFinishedStatus) {
            // Add to finished if not already there - add to beginning for most recent first
            const item = state.allItems.find(i => i.id === id)
            if (item && !state.finished.find(f => f.id === id)) {
                const completedItem = { 
                    ...item, 
                    status: nextStatus,
                    completed_at: nextStatus === 'completed' ? new Date().toISOString() : item.completed_at
                }
                newFinished = [completedItem, ...state.finished]
            } else if (item) {
                // Update existing item in finished array
                const completedItem = { 
                    ...item, 
                    status: nextStatus,
                    completed_at: nextStatus === 'completed' ? new Date().toISOString() : item.completed_at
                }
                newFinished = state.finished.map(f => f.id === id ? completedItem : f)
            }
        } else {
            // Remove from finished if status changed away from completed/caught_up
            newFinished = state.finished.filter(item => item.id !== id)
        }

        // Sort arrays by updated_at (most recent first)
        newTvShows.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newMovies.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newFinished.sort((a, b) => {
            const dateA = new Date(a.completed_at || a.updated_at || 0)
            const dateB = new Date(b.completed_at || b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        // Apply optimistic update
        set({
            allItems: newAllItems,
            tvShows: newTvShows,
            movies: newMovies,
            finished: newFinished
        })

        // Silent background sync to Supabase
        try {
            const updateData: Partial<WatchlistItem> = {
                status: nextStatus,
                updated_at: new Date().toISOString()
            }

            if (nextStatus === 'completed') {
                updateData.completed_at = new Date().toISOString()
            }

            const { error } = await supabase
                .from('watchlist')
                .update(updateData)
                .eq('id', id)

            if (error) {
                throw error
            }

            // Invalidate cache when status changes to/from completed/caught_up to ensure Finished page shows updated data
            const previousItem = previousAllItems.find(i => i.id === id)
            const wasFinished = previousItem?.status === 'completed' || previousItem?.status === 'caught_up'
            const isFinished = nextStatus === 'completed' || nextStatus === 'caught_up'
            if (wasFinished !== isFinished) {
                await invalidateUserCache()
            }

            // Update cache with new data
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const newAllItems = [...previousAllItems]
                const itemIndex = newAllItems.findIndex(i => i.id === id)
                if (itemIndex !== -1) {
                    newAllItems[itemIndex] = { ...newAllItems[itemIndex], status: nextStatus, updated_at: new Date().toISOString() }
                    if (nextStatus === 'completed') {
                        newAllItems[itemIndex].completed_at = new Date().toISOString()
                    }
                    await cacheService.set('library', user.id, newAllItems, 5 * 60 * 1000)
                }
            }
        } catch (error) {
            // Rollback on error
            console.error('Failed to update status, rolling back:', error)
            set({
                allItems: previousAllItems,
                tvShows: previousTvShows,
                movies: previousMovies,
                finished: previousFinished,
                error: error instanceof Error ? error.message : 'Failed to update status'
            })
        }
    },

    // Generic update function for any field
    updateItem: async (id: string, updates: Partial<WatchlistItem>) => {
        const state = get()
        
        // Invalidate cache for this update
        cacheService.clearPattern('library')
        cacheService.clearPattern('watchlist')
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Only update timestamp for user-meaningful changes that should affect sorting
        const shouldUpdateTimestamp = updates.status !== undefined || 
                                      updates.current_episode !== undefined ||
                                      updates.completed_at !== undefined

        // Optimistic update
        const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
            items.map(item => item.id === id ? { 
                ...item, 
                ...updates, 
                ...(shouldUpdateTimestamp ? { updated_at: new Date().toISOString() } : {})
            } : item)

        const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
        const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]
        const newMovies = updateInArray(state.movies) as WatchlistItem[]
        
        // Handle finished array
        const isFinishedStatus = updates.status === 'completed' || updates.status === 'caught_up'
        let newFinished = state.finished
        if (isFinishedStatus) {
            const item = state.allItems.find(i => i.id === id)
            if (item && !state.finished.find(f => f.id === id)) {
                // Add to beginning for most recent first
                const completedItem = { 
                    ...item, 
                    ...updates,
                    completed_at: updates.status === 'completed' ? new Date().toISOString() : item.completed_at
                }
                newFinished = [completedItem, ...state.finished]
            } else if (item) {
                // Update existing item in finished array to move it to top
                const completedItem = { 
                    ...item, 
                    ...updates,
                    completed_at: updates.status === 'completed' ? new Date().toISOString() : item.completed_at
                }
                newFinished = state.finished.filter(f => f.id !== id)
                newFinished = [completedItem, ...newFinished]
            }
        } else if (updates.status && !isFinishedStatus) {
            newFinished = state.finished.filter(item => item.id !== id)
        }

        // Sort arrays by updated_at (most recent first)
        newTvShows.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newMovies.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newFinished.sort((a, b) => {
            const dateA = new Date(a.completed_at || a.updated_at || 0)
            const dateB = new Date(b.completed_at || b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        // Apply optimistic update
        set({
            allItems: newAllItems,
            tvShows: newTvShows,
            movies: newMovies,
            finished: newFinished
        })

        // Silent background sync
        try {
            const { error } = await supabase
                .from('watchlist')
                .update({
                    ...updates,
                    ...(shouldUpdateTimestamp ? { updated_at: new Date().toISOString() } : {})
                })
                .eq('id', id)

            if (error) {
                throw error
            }

            // Invalidate cache when status changes to/from completed/caught_up to ensure Finished page shows updated data
            const previousItem = previousAllItems.find(i => i.id === id)
            const wasFinished = previousItem?.status === 'completed' || previousItem?.status === 'caught_up'
            const isFinished = updates.status === 'completed' || updates.status === 'caught_up'
            if (wasFinished !== isFinished) {
                await invalidateUserCache()
            }

            // Update cache with new data
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const newAllItems = [...previousAllItems]
                const itemIndex = newAllItems.findIndex(i => i.id === id)
                if (itemIndex !== -1) {
                    newAllItems[itemIndex] = { 
                        ...newAllItems[itemIndex], 
                        ...updates, 
                        ...(shouldUpdateTimestamp ? { updated_at: new Date().toISOString() } : {})
                    }
                    await cacheService.set('library', user.id, newAllItems, 5 * 60 * 1000)
                }
            }
        } catch (error) {
            // Rollback on error
            console.error('Failed to update item, rolling back:', error)
            set({
                allItems: previousAllItems,
                tvShows: previousTvShows,
                movies: previousMovies,
                finished: previousFinished,
                error: error instanceof Error ? error.message : 'Failed to update item'
            })
        }
    },

    // Remove item from library
    removeItem: async (id: string) => {
        const state = get()
        
        // Invalidate cache for this removal
        cacheService.clearPattern('library')
        cacheService.clearPattern('watchlist')
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update - remove from all arrays
        const newAllItems = state.allItems.filter(item => item.id !== id)
        const newTvShows = state.tvShows.filter(item => item.id !== id)
        const newMovies = state.movies.filter(item => item.id !== id)
        const newFinished = state.finished.filter(item => item.id !== id)

        // Sort arrays by updated_at (most recent first)
        newTvShows.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newMovies.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newFinished.sort((a, b) => {
            const dateA = new Date(a.completed_at || a.updated_at || 0)
            const dateB = new Date(b.completed_at || b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        // Apply optimistic update
        set({
            allItems: newAllItems,
            tvShows: newTvShows,
            movies: newMovies,
            finished: newFinished,
            watchlistIds: computeWatchlistIds(newAllItems)
        })

        // Silent background sync
        try {
            const { error } = await supabase
                .from('watchlist')
                .delete()
                .eq('id', id)

            if (error) {
                throw error
            }

            // Invalidate cache when item is removed to ensure Finished page shows updated data immediately
            await invalidateUserCache()

            // Update cache with new data
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const newAllItems = previousAllItems.filter(item => item.id !== id)
                await cacheService.set('library', user.id, newAllItems, 5 * 60 * 1000)
            }
        } catch (error) {
            // Rollback on error
            console.error('Failed to remove item, rolling back:', error)
            set({
                allItems: previousAllItems,
                tvShows: previousTvShows,
                movies: previousMovies,
                finished: previousFinished,
                watchlistIds: computeWatchlistIds(previousAllItems),
                error: error instanceof Error ? error.message : 'Failed to remove item'
            })
        }
    },

    // Add item to library
    addItem: async (item: WatchlistItem) => {
        const state = get()

        // For TV shows, fetch total episodes and seasons from TMDB
        let enhancedItem = { ...item }
        if ((item.media_type === 'tv' || item.media_type === 'anime') && item.tmdb_id) {
            try {
                const { getTVDetails } = await import('../services/tmdbService')
                const details = await getTVDetails(item.tmdb_id)
                enhancedItem = {
                    ...item,
                    total_episodes: details.number_of_episodes || 0,
                    total_seasons: details.number_of_seasons || 1,
                }
            } catch (error) {
                console.error('Failed to fetch TV details for episode count:', error)
            }
        }

        // Set completed_at when adding with completed status
        if (enhancedItem.status === 'completed' && !enhancedItem.completed_at) {
            enhancedItem.completed_at = new Date().toISOString()
        }

        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update - add to appropriate arrays
        const newAllItems = [enhancedItem, ...state.allItems]

        let newTvShows = state.tvShows
        let newMovies = state.movies
        let newFinished = state.finished

        if (enhancedItem.media_type === 'tv' || enhancedItem.media_type === 'anime') {
            newTvShows = [enhancedItem as TVShowWithProgress, ...state.tvShows]
        } else if (enhancedItem.media_type === 'movie') {
            newMovies = [enhancedItem, ...state.movies]
        }

        if (enhancedItem.status === 'completed' || enhancedItem.status === 'caught_up') {
            newFinished = [enhancedItem, ...state.finished]
        }

        // Sort arrays by updated_at (most recent first)
        newTvShows.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newMovies.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0)
            const dateB = new Date(b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        newFinished.sort((a, b) => {
            const dateA = new Date(a.completed_at || a.updated_at || 0)
            const dateB = new Date(b.completed_at || b.updated_at || 0)
            return dateB.getTime() - dateA.getTime()
        })

        // Apply optimistic update
        set({
            allItems: newAllItems,
            tvShows: newTvShows,
            movies: newMovies,
            finished: newFinished,
            watchlistIds: computeWatchlistIds(newAllItems)
        })

        // Silent background sync
        try {
            const { error } = await supabase
                .from('watchlist')
                .insert([enhancedItem])

            if (error) {
                throw error
            }

            // Invalidate cache to ensure the enhanced data is reflected across the app
            const { invalidateUserCache } = await import('../services/cacheService')
            await invalidateUserCache()

            // Update cache with new data
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const newAllItems = [enhancedItem, ...previousAllItems]
                await cacheService.set('library', user.id, newAllItems, 5 * 60 * 1000)
            }
        } catch (error) {
            // Rollback on error
            console.error('Failed to add item, rolling back:', error)
            set({
                allItems: previousAllItems,
                tvShows: previousTvShows,
                movies: previousMovies,
                finished: previousFinished,
                watchlistIds: computeWatchlistIds(previousAllItems),
                error: error instanceof Error ? error.message : 'Failed to add item'
            })
        }
    },

    // Refresh single item from database
    refreshItem: async (id: string) => {
        try {
            const { data, error } = await supabase
                .from('watchlist')
                .select(selectColumns)
                .eq('id', id)
                .single()

            if (error || !data) {
                throw error || new Error('Item not found')
            }

            // For TV shows, fetch total episodes and seasons from TMDB if missing
            let enhancedData = { ...data }
            let needsDbUpdate = false
            if ((data.media_type === 'tv' || data.media_type === 'anime') && data.tmdb_id && (!data.total_episodes || !data.total_seasons)) {
                try {
                    const { getTVDetails } = await import('../services/tmdbService')
                    const details = await getTVDetails(data.tmdb_id)
                    enhancedData = {
                        ...data,
                        total_episodes: details.number_of_episodes || 0,
                        total_seasons: details.number_of_seasons || 1,
                    }
                    needsDbUpdate = true
                } catch (tmdbError) {
                    console.error('Failed to fetch TV details for episode count:', tmdbError)
                }
            }

            // If we enhanced the data, save it to the database
            if (needsDbUpdate) {
                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({
                        total_episodes: enhancedData.total_episodes,
                        total_seasons: enhancedData.total_seasons,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)

                if (updateError) {
                    console.error('Failed to update total episodes in database:', updateError)
                } else {
                    // Invalidate cache to ensure the updated data is reflected across the app
                    const { invalidateUserCache } = await import('../services/cacheService')
                    await invalidateUserCache()
                }
            }

            const state = get()

            // Re-categorize based on new status
            const newAllItems = state.allItems.map(item => item.id === id ? enhancedData : item)

            const newTvShows = newAllItems.filter(item => item.media_type === 'tv' || item.media_type === 'anime') as TVShowWithProgress[]
            const newMovies = newAllItems.filter(item => item.media_type === 'movie')
            const newFinished = newAllItems.filter(item => item.status === 'completed' || item.status === 'caught_up')

            // Sort finished array by completed_at, falling back to updated_at (most recent first)
            newFinished.sort((a, b) => {
                const dateA = new Date(a.completed_at || a.updated_at || 0)
                const dateB = new Date(b.completed_at || b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            // Sort tvShows array by updated_at (most recent first)
            newTvShows.sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            // Sort movies array by updated_at (most recent first)
            newMovies.sort((a, b) => {
                const dateA = new Date(a.updated_at || 0)
                const dateB = new Date(b.updated_at || 0)
                return dateB.getTime() - dateA.getTime()
            })

            set({
                allItems: newAllItems,
                tvShows: newTvShows,
                movies: newMovies,
                finished: newFinished,
                watchlistIds: computeWatchlistIds(newAllItems)
            })
        } catch (error) {
            console.error('Failed to refresh item:', error)
            set({
                error: error instanceof Error ? error.message : 'Failed to refresh item'
            })
        }

        // Update cache with the refreshed data
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const state = get()
            await cacheService.set('library', user.id, state.allItems, 5 * 60 * 1000)
        }
    },

    // Recompute watchlistIds from allItems (useful after external updates)
    syncWatchlistIds: () => {
        const state = get()
        set({ watchlistIds: computeWatchlistIds(state.allItems) })
    },

    // Force refresh from database (ignores cache)
    initialize: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Reset initialized state to force fresh fetch
        set({ isInitialized: false })
        
        // Clear cache to ensure fresh data
        await cacheService.clearPattern('library')
        
        // Fetch fresh data
        await get().fetchInitialLibrary(user.id)
    },

    // Reset store state (for logout)
    reset: () => {
        set({
            allItems: [],
            tvShows: [],
            movies: [],
            finished: [],
            watchlistIds: new Set<number>(),
            isLoading: false,
            isInitialized: false,
            error: null
        })
    }
}))

// Selector hooks for optimized re-renders
export const useLibraryWatchlistIds = () => useLibraryStore((state) => state.watchlistIds)
