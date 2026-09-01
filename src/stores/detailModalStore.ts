import { create } from 'zustand'

type DetailType = 'movie' | 'tv' | 'person' | 'episode'

interface DetailModalState {
  isOpen: boolean
  type: DetailType | null
  id: number | null
  season?: number
  episode?: number
  open: (type: DetailType, id: number, season?: number, episode?: number) => void
  syncFromURL: (type: DetailType, id: number, season?: number, episode?: number) => void
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
let savedScrollY = 0

export const getDetailBaseTitle = (): string => baseTitle

export const setDetailBaseTitle = (title: string): void => {
    baseTitle = title
}

const useDetailModalStore = create<DetailModalState>((set, get) => ({
  isOpen: false,
  type: null,
  id: null,
  season: undefined,
  episode: undefined,

  open: (type, id, season, episode) => {
    const current = get()
    if (!current.isOpen) {
      baseTitle = document.title
      savedScrollY = window.scrollY
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    }

    const sameContent =
      current.isOpen &&
      current.type === type &&
      current.id === id &&
      current.season === season &&
      current.episode === episode
    if (sameContent) return

    set({ isOpen: true, type, id, season, episode })
    window.history.pushState({ detailModal: true }, '', buildHref(type, id, season, episode))
  },

  // Update state in response to history back/forward. Never pushes history.
  syncFromURL: (type, id, season, episode) => {
    if (!get().isOpen) {
      baseTitle = document.title
      savedScrollY = window.scrollY
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    }
    set({ isOpen: true, type, id, season, episode })
  },

  close: () => {
    set({ isOpen: false, type: null, id: null, season: undefined, episode: undefined })
    requestAnimationFrame(() => {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto'
      }
      window.scrollTo({ top: savedScrollY, behavior: 'auto' })
    })
  },
}))

export default useDetailModalStore