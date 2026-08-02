import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'
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
    updateStatus: (id: string, nextStatus: WatchlistItem['status']) => Promise<void>
    incrementProgress: (id: string) => Promise<void>
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
        if (get().isInitialized) {
            return // Already loaded
        }

        if (!userId) {
            console.error('No userId provided to fetchInitialLibrary')
            return
        }

        set({ isLoading: true, error: null })

        try {
            console.log('Fetching library for user:', userId)
            
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
            }

            console.log('Fetched items:', data?.length || 0)
            const items = data || []

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
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update - update all arrays immediately
        const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
            items.map(item => item.id === id ? { ...item, status: nextStatus, updated_at: new Date().toISOString() } : item)

        const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
        const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]
        const newMovies = updateInArray(state.movies) as WatchlistItem[]
        
        // Handle finished array - move item in/out based on status
        const isFinishedStatus = nextStatus === 'completed' || nextStatus === 'caught_up'
        let newFinished = state.finished
        if (isFinishedStatus) {
            // Add to finished if not already there
            const item = state.allItems.find(i => i.id === id)
            if (item && !state.finished.find(f => f.id === id)) {
                newFinished = [...state.finished, { ...item, status: nextStatus }]
            }
        } else {
            // Remove from finished if status changed away from completed/caught_up
            newFinished = state.finished.filter(item => item.id !== id)
        }

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

    // Optimistic update for progress increment
    incrementProgress: async (id: string) => {
        const state = get()
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]

        // Optimistic update
        const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
            items.map(item => {
                if (item.id !== id) return item
                
                const newEpisode = (item.current_episode || 0) + 1
                return {
                    ...item,
                    current_episode: newEpisode,
                    updated_at: new Date().toISOString()
                }
            })

        const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
        const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]

        // Apply optimistic update
        set({
            allItems: newAllItems,
            tvShows: newTvShows
        })

        // Silent background sync
        try {
            const item = state.allItems.find(i => i.id === id)
            if (!item) return

            const newEpisode = (item.current_episode || 0) + 1
            
            const { error } = await supabase
                .from('watchlist')
                .update({
                    current_episode: newEpisode,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)

            if (error) {
                throw error
            }
        } catch (error) {
            // Rollback on error
            console.error('Failed to increment progress, rolling back:', error)
            set({
                allItems: previousAllItems,
                tvShows: previousTvShows,
                error: error instanceof Error ? error.message : 'Failed to update progress'
            })
        }
    },

    // Generic update function for any field
    updateItem: async (id: string, updates: Partial<WatchlistItem>) => {
        const state = get()
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update
        const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
            items.map(item => item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item)

        const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
        const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]
        const newMovies = updateInArray(state.movies) as WatchlistItem[]
        
        // Handle finished array
        const isFinishedStatus = updates.status === 'completed' || updates.status === 'caught_up'
        let newFinished = state.finished
        if (isFinishedStatus) {
            const item = state.allItems.find(i => i.id === id)
            if (item && !state.finished.find(f => f.id === id)) {
                newFinished = [...state.finished, { ...item, ...updates }]
            }
        } else if (updates.status && !isFinishedStatus) {
            newFinished = state.finished.filter(item => item.id !== id)
        }

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
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)

            if (error) {
                throw error
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
        
        // Store previous state for rollback
        const previousAllItems = [...state.allItems]
        const previousTvShows = [...state.tvShows]
        const previousMovies = [...state.movies]
        const previousFinished = [...state.finished]

        // Optimistic update - add to appropriate arrays
        const newAllItems = [item, ...state.allItems]
        
        let newTvShows = state.tvShows
        let newMovies = state.movies
        let newFinished = state.finished

        if (item.media_type === 'tv' || item.media_type === 'anime') {
            newTvShows = [item as TVShowWithProgress, ...state.tvShows]
        } else if (item.media_type === 'movie') {
            newMovies = [item, ...state.movies]
        }

        if (item.status === 'completed' || item.status === 'caught_up') {
            newFinished = [item, ...state.finished]
        }

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
                .insert([item])

            if (error) {
                throw error
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

            const state = get()
            
            // Update in all arrays
            const updateInArray = (items: WatchlistItem[] | TVShowWithProgress[]) =>
                items.map(item => item.id === id ? data : item)

            const newAllItems = updateInArray(state.allItems) as WatchlistItem[]
            const newTvShows = updateInArray(state.tvShows) as TVShowWithProgress[]
            const newMovies = updateInArray(state.movies) as WatchlistItem[]
            const newFinished = updateInArray(state.finished) as WatchlistItem[]

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
    },

    // Recompute watchlistIds from allItems (useful after external updates)
    syncWatchlistIds: () => {
        const state = get()
        set({ watchlistIds: computeWatchlistIds(state.allItems) })
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
