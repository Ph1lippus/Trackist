import { create } from 'zustand'

interface SelectionState {
    // Movies selection
    moviesSelectionMode: boolean
    moviesSelectedIds: Set<string>
    setMoviesSelectionMode: (mode: boolean) => void
    setMoviesSelectedIds: (ids: Set<string>) => void
    toggleMovieSelection: (id: string) => void
    clearMovieSelection: () => void
    
    // TV Shows selection
    tvShowsSelectionMode: boolean
    tvShowsSelectedIds: Set<string>
    setTVShowsSelectionMode: (mode: boolean) => void
    setTVShowsSelectedIds: (ids: Set<string>) => void
    toggleTVShowSelection: (id: string) => void
    clearTVShowSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
    // Movies selection
    moviesSelectionMode: false,
    moviesSelectedIds: new Set(),
    setMoviesSelectionMode: (mode) => set({ moviesSelectionMode: mode }),
    setMoviesSelectedIds: (ids) => set({ moviesSelectedIds: ids }),
    toggleMovieSelection: (id) => set((state) => {
        const newSet = new Set(state.moviesSelectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        return { moviesSelectedIds: newSet }
    }),
    clearMovieSelection: () => set({ moviesSelectedIds: new Set(), moviesSelectionMode: false }),
    
    // TV Shows selection
    tvShowsSelectionMode: false,
    tvShowsSelectedIds: new Set(),
    setTVShowsSelectionMode: (mode) => set({ tvShowsSelectionMode: mode }),
    setTVShowsSelectedIds: (ids) => set({ tvShowsSelectedIds: ids }),
    toggleTVShowSelection: (id) => set((state) => {
        const newSet = new Set(state.tvShowsSelectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        return { tvShowsSelectedIds: newSet }
    }),
    clearTVShowSelection: () => set({ tvShowsSelectedIds: new Set(), tvShowsSelectionMode: false }),
}))