import { create } from 'zustand'

type DetailType = 'movie' | 'tv' | 'person' | 'episode'

// A single open detail in the overlay stack. The overlay keeps the whole stack
// mounted (previous details stay rendered underneath the top one) so that going
// back to a person/movie/etc. shows it exactly as it was — same state, same
// scroll position — instead of unmounting and re-fetching it from scratch.
interface DetailEntry {
  type: DetailType
  id: number
  season?: number
  episode?: number
}

interface DetailModalState {
  isOpen: boolean
  type: DetailType | null
  id: number | null
  season?: number
  episode?: number
  stack: DetailEntry[]
  backdropUrl: string | null
  // The URL the modal is pinned to. While the modal is open the address bar
  // never changes, so React Router never navigates and the page underneath
  // stays mounted (scroll/state intact). A single synthetic history entry
  // ("keep-alive") is pushed so Back / device-back surface a popstate we can
  // intercept to pop the modal stack; it is re-pushed on every back until the
  // stack empties, at which point the browser settles back on the pinned URL.
  pinHref: string | null
  open: (type: DetailType, id: number, season?: number, episode?: number) => void
  back: () => void
  goBack: () => void
  setBackdropUrl: (url: string | null) => void
  setRememberedSeason: (showId: number, season: number) => void
  getRememberedSeason: (showId: number) => number | null
  close: () => void
}

const OPEN_PIN_STATE = { detailModalPin: true }

// TODO(debug): temporary instrumentation to diagnose one-back-closes-everything.
const dbg = (...a: unknown[]) => console.debug('[DBG-modal]', ...a)

// The document title the underlying page had before the modal opened. Captured
// synchronously in open() because the detail page inside the overlay overrides
// document.title before any overlay effect can read it.
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

const sameEntry = (a: DetailEntry | undefined, type: DetailType, id: number, season?: number, episode?: number): boolean =>
  !!a && a.type === type && a.id === id && a.season === season && a.episode === episode

const useDetailModalStore = create<DetailModalState>((set, get) => ({
  isOpen: false,
  type: null,
  id: null,
  season: undefined,
  episode: undefined,
  stack: [],
  backdropUrl: null,
  pinHref: null,

  setBackdropUrl: (url) => set({ backdropUrl: url }),

  open: (type, id, season, episode) => {
    const current = get()
    if (!current.isOpen) {
      baseTitle = document.title
      const href = window.location.href
      // Pin one synthetic history entry (same URL) so browser/device Back
      // produces a popstate we can handle in DetailOverlay. The URL itself
      // never changes, so React Router keeps rendering the page the modal was
      // opened over and never unmounts it.
      window.history.pushState(OPEN_PIN_STATE, '', href)
      set({ pinHref: window.location.pathname + window.location.search + window.location.hash })
      dbg('open first:', type, id, 'pinHref=', window.location.pathname + window.location.search + window.location.hash, 'histIdx=', (window.history.state as { idx?: number | null } | null)?.idx ?? null)
    } else if (sameEntry(current.stack[current.stack.length - 1], type, id, season, episode)) {
      dbg('open ignored (same top):', type, id)
      return
    } else {
      dbg('open layer:', type, id, 'stackLen=', current.stack.length, 'histIdx=', (window.history.state as { idx?: number | null } | null)?.idx ?? null)
    }

    const stack = current.stack
    // Re-opening a detail already somewhere in the stack rewinds to it (avoids
    // duplicate layers that share the same scroll container key).
    const existing = stack.findIndex((e) => sameEntry(e, type, id, season, episode))
    const nextStack = existing !== -1 ? stack.slice(0, existing + 1) : [...stack, { type, id, season, episode }]
    const top = nextStack[nextStack.length - 1]

    set({
      isOpen: true,
      type: top.type,
      id: top.id,
      season: top.season,
      episode: top.episode,
      stack: nextStack,
      backdropUrl: null,
    })
  },

  // Deterministic one-step-back for the app's own controls (navbar back button,
  // Escape). The URL never changes while the modal is open, so popping a layer
  // here never involves browser history — it just slices the stack, revealing
  // the still-mounted layer underneath. A single press can therefore never
  // close the whole modal. Popping the last layer closes the modal and then
  // collapses the keep-alive entry with history.back() so a later browser/
  // device back lands on the real page instead of on the pin.
  back: () => {
    const s = get()
    if (!s.isOpen) return
    const last = s.stack.length <= 1
    s.goBack()
    if (last) {
      window.history.back()
    }
  },

  // Pop one layer of the modal stack. Reveals the previous entry, which has
  // stayed mounted underneath (its scroll and state intact). Popping the last
  // layer closes the modal; history is managed by DetailOverlay's popstate
  // handler, never here.
  goBack: () => {
    const s = get()
    if (!s.isOpen) return
    if (s.stack.length > 1) {
      const stack = s.stack.slice(0, -1)
      const prev = stack[stack.length - 1]
      dbg('goBack: layer ->', prev.type, prev.id, 'remaining=', stack.length)
      set({
        isOpen: true,
        type: prev.type,
        id: prev.id,
        season: prev.season,
        episode: prev.episode,
        stack,
        backdropUrl: null,
      })
    } else {
      dbg('goBack: last layer -> close')
      s.close()
    }
  },

  setRememberedSeason: (showId, season) => {
    rememberedSeasons.set(showId, season)
  },

  getRememberedSeason: (showId) => rememberedSeasons.get(showId) ?? null,

  close: () => {
    dbg('close called. histIdx=', (window.history.state as { idx?: number | null } | null)?.idx ?? null, 'location=', window.location.pathname + window.location.search + window.location.hash)
    set({
      isOpen: false,
      type: null,
      id: null,
      season: undefined,
      episode: undefined,
      stack: [],
      backdropUrl: null,
      pinHref: null,
    })
  },
}))

export default useDetailModalStore