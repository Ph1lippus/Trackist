import { create } from 'zustand'

type DetailType = 'movie' | 'tv' | 'person' | 'episode'

interface DetailModalState {
  isOpen: boolean
  type: DetailType | null
  id: number | null
  season?: number
  episode?: number
  backdropUrl: string | null
  open: (type: DetailType, id: number, season?: number, episode?: number) => void
  syncFromURL: (type: DetailType, id: number, season?: number, episode?: number) => void
  setBackdropUrl: (url: string | null) => void
  setRememberedSeason: (showId: number, season: number) => void
  getRememberedSeason: (showId: number) => number | null
  close: () => void
}

const buildHref = (type: DetailType, id: number, season?: number, episode?: number): string => {
  if (type === 'episode' && season != null && episode != null) {
    return `/tv/${id}/season/${season}/episode/${episode}`
  }
  return `/${type}/${id}`
}

// The document title the underlying page had before the modal opened. Captured
// synchronously in open()/syncFromURL() because the detail page inside the
// overlay overrides document.title before any overlay effect can read it.
let baseTitle = ''

export const getDetailBaseTitle = (): string => baseTitle

export const setDetailBaseTitle = (title: string): void => {
    baseTitle = title
}

// Remembered season per TV show id, kept for the current SPA session. Written
// whenever the user lands on or selects a season within a TV show's detail, and
// read on every subsequent mount so that navigating away (to an episode detail,
// on the modal overlay or via page navigation) and coming back restores the exact
// season they were on — instead of re-computing from progress each time.
const rememberedSeasons = new Map<number, number>()

const useDetailModalStore = create<DetailModalState>((set, get) => ({
  isOpen: false,
  type: null,
  id: null,
  season: undefined,
  episode: undefined,
  backdropUrl: null,

  setBackdropUrl: (url) => set({ backdropUrl: url }),

  open: (type, id, season, episode) => {
    const current = get()
    if (!current.isOpen) baseTitle = document.title

    const sameContent =
      current.isOpen &&
      current.type === type &&
      current.id === id &&
      current.season === season &&
      current.episode === episode
    if (sameContent) return

    set({ isOpen: true, type, id, season, episode, backdropUrl: null })
    window.history.pushState({ detailModal: true }, '', buildHref(type, id, season, episode))
  },

  setRememberedSeason: (showId, season) => {
    rememberedSeasons.set(showId, season)
  },

  getRememberedSeason: (showId) => rememberedSeasons.get(showId) ?? null,

  // Update state in response to history back/forward. Never pushes history.
  syncFromURL: (type, id, season, episode) => {
    if (!get().isOpen) baseTitle = document.title
    set({ isOpen: true, type, id, season, episode })
  },

  close: () => {
    set({ isOpen: false, type: null, id: null, season: undefined, episode: undefined, backdropUrl: null })
  },
}))

export default useDetailModalStore