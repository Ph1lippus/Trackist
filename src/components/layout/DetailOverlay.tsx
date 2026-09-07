import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useDetailModalStore, {
  getDetailBaseTitle,
  setDetailBaseTitle,
} from '../../stores/detailModalStore'
import MovieDetail from '../../pages/MovieDetail'
import TVShowDetail from '../../pages/TVShowDetail'
import PersonDetail from '../../pages/PersonDetail'
import EpisodeDetail from '../../pages/EpisodeDetail'

// Duration (ms) of the exit fade. Must match the CSS `detailOverlayOut`
// animation so the overlay stays mounted for exactly the fade-out length
// before being removed from the DOM. Kept short for a snappy feel.
const EXIT_MS = 180

const entryKey = (type: string, id: number, season?: number, episode?: number): string =>
  `${type}:${id}:${season ?? ''}:${episode ?? ''}`

const renderDetail = (
  type: string,
  id: number,
  season: number | undefined,
  episode: number | undefined,
  onLoaded: () => void
) => {
  switch (type) {
    case 'movie':
      return <MovieDetail itemId={id} onLoaded={onLoaded} />
    case 'tv':
      return <TVShowDetail itemId={id} onLoaded={onLoaded} />
    case 'person':
      return <PersonDetail itemId={id} onLoaded={onLoaded} />
    case 'episode':
      return season != null && episode != null ? (
        <EpisodeDetail
          itemId={id}
          seasonNumber={season}
          episodeNumber={episode}
          onLoaded={onLoaded}
        />
      ) : null
    default:
      return null
  }
}

const DetailOverlay: React.FC = () => {
  const { isOpen, type, id, stack, backdropUrl } = useDetailModalStore()
  const location = useLocation()
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const lastRouterPath = useRef(location.pathname)

  // Exit-phase state: when `isOpen` flips false we keep the overlay mounted for
  // EXIT_MS to play the fade-out (CSS `detailOverlayOut`), then remove it. We
  // snapshot the last open values so the outgoing layer stays visible while
  // fading instead of disappearing in a hard cut.
  //
  // The open->closing transition is derived in the render body via the guarded
  // "adjust state when a value changes" pattern (setState during render is
  // legal React; we avoid reading refs during render to satisfy the linter and
  // keep updates predictable).
  const [closing, setClosing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(isOpen)
  const [snapshot, setSnapshot] = useState({ type, id, stack, backdropUrl })

  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setClosing(false)
    } else {
      setClosing(true)
    }
  }

  // Keep a snapshot of the last open values so the exit fade can render the
  // outgoing layer after the store resets to closed. Updated via the guarded
  // "adjust state during render" pattern (legal setState-in-render, no refs),
  // only when the live values actually change to avoid extra renders.
  if (
    isOpen &&
    (snapshot.type !== type ||
      snapshot.id !== id ||
      snapshot.stack !== stack ||
      snapshot.backdropUrl !== backdropUrl)
  ) {
    setSnapshot({ type, id, stack, backdropUrl })
  }

  // Layers reveal under an opaque curtain only once their content is loaded.
  // Each Detail* page reports readiness via `onLoaded`; the safety timer below
  // lifts the curtain even if a page never reports (e.g. a hung request).
  const [readyKeys, setReadyKeys] = useState<ReadonlySet<string>>(() => new Set<string>())

  const handleLayerLoaded = useCallback((key: string) => {
    setReadyKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [])

  const mount = isOpen || closing

  // After the exit fade completes, remove the overlay from the DOM.
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => setClosing(false), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [closing])


  // Close the modal when a real navigation happens underneath it (navbar/tab).
  // The modal never changes the URL (it stays pinned), so any router pathname
  // change while the modal is open is a genuine navigation to a new page —
  // dismiss the modal and let the new page render.
  useEffect(() => {
    if (location.pathname === lastRouterPath.current) return
    lastRouterPath.current = location.pathname
    if (isOpen) {
      // The new page has already rendered and set its own document title, so
      // capture it as the new base so the close cleanup restores the right one.
      setDetailBaseTitle(document.title)
      useDetailModalStore.getState().close()
    }
  }, [location.pathname, isOpen])

  // Handle browser/device Back while the modal is open. The URL stays pinned to
  // the page the modal was opened over, so a popstate that lands on that same
  // URL is "back within the modal": pop one stack layer (revealing the previous
  // one, still mounted with its scroll/state) and re-pin so the next Back also
  // produces a popstate. When the last layer is popped the modal closes without
  // re-pinning, leaving the browser on the real pinned entry. A popstate that
  // lands elsewhere (backing onto a page navigated to while the modal was up)
  // just closes the modal and lets React Router render that page.
  useEffect(() => {
    if (!isOpen) return

    const handlePopState = () => {
      const s = useDetailModalStore.getState()
      if (!s.isOpen) return
      const path = window.location.pathname + window.location.search + window.location.hash
      if (path !== s.pinHref) {
        s.close()
        return
      }
      s.goBack()
      if (useDetailModalStore.getState().isOpen) {
        window.history.pushState({ detailModalPin: true }, '', window.location.href)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isOpen])

  // Escape acts like back: it pops one layer of the modal stack (via history)
  // instead of force-closing the whole stack. When there is no older modal layer
  // the popstate handler closes the overlay. Skipped while a higher-layer
  // confirm modal is open.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('.confirm-modal-overlay')) return
      useDetailModalStore.getState().back()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Lock page scroll while open (and through the brief exit fade).
  useEffect(() => {
    if (isOpen || closing) {
      document.body.classList.add('no-scroll')
    } else {
      document.body.classList.remove('no-scroll')
    }
    return () => {
      document.body.classList.remove('no-scroll')
    }
  }, [isOpen, closing])

  // Focus management: remember the opener, take focus into the modal, and hand
  // it back when it closes.
  useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      const backBtn = document.querySelector<HTMLElement>('.navbar-back-btn')
      if (backBtn) backBtn.focus()
    } else if (previouslyFocused.current && document.contains(previouslyFocused.current)) {
      previouslyFocused.current.focus?.()
      previouslyFocused.current = null
    }
  }, [isOpen])

  // Restore the underlying page's document title when the modal closes. The
  // base title is captured in open(); if the modal was closed by a real
  // navigation, the route-change effect above already re-set the base to the
  // new page's title, so this becomes a no-op instead of clobbering it.
  useEffect(() => {
    if (isOpen) return
    document.title = getDetailBaseTitle() || document.title
  }, [isOpen])

  // Keep the current top entry's saved backdrop in sync with the global
  // backdropUrl so that if the user later pops back to this layer, the
  // correct backdrop is restored.
  useEffect(() => {
    if (!isOpen) return
    const s = useDetailModalStore.getState()
    if (s.stack.length === 0) return
    const top = s.stack[s.stack.length - 1]
    if (top.backdropUrl !== backdropUrl) {
      const newStack = [...s.stack]
      newStack[newStack.length - 1] = { ...top, backdropUrl }
      useDetailModalStore.setState({ stack: newStack })
    }
  }, [backdropUrl, isOpen])

  // Safety net: lift the curtain for the current top layer if it never reports
  // loaded, so a hung request can't leave an opaque screen forever.
  useEffect(() => {
    if (!isOpen) return
    const s = useDetailModalStore.getState()
    if (!s.isOpen || s.stack.length === 0) return
    const top = s.stack[s.stack.length - 1]
    const topKey = entryKey(top.type, top.id, top.season, top.episode)
    if (readyKeys.has(topKey)) return
    const t = window.setTimeout(() => {
      setReadyKeys((prev) => (prev.has(topKey) ? prev : new Set(prev).add(topKey)))
    }, 2500)
    return () => window.clearTimeout(t)
  }, [isOpen, readyKeys])

  const view = mount
    ? { type: snapshot.type, id: snapshot.id, stack: snapshot.stack, backdropUrl: snapshot.backdropUrl }
    : null
  if (!mount || !view?.type || view.id == null || view.stack.length === 0) return null

  const overlayClass = `detail-overlay${closing ? ' detail-overlay--exiting' : ''}`

  // The top layer is revealed under an opaque curtain only once its content
  // reports loaded (see CSS `.detail-overlay__scroll--top::after`); all deeper
  // layers are `display:none`, so nothing can bleed through mid-transition.
  const topEntry = view.stack[view.stack.length - 1]
  const topKey = entryKey(topEntry.type, topEntry.id, topEntry.season, topEntry.episode)
  const topReady = readyKeys.has(topKey)
  return (
    <div className={overlayClass} role="dialog" aria-modal="true" aria-label={`${view.type} details`}>
      {view.backdropUrl && view.type !== 'person' && view.type !== 'episode' && (
        <div className="detail-page__backdrop">
          <img src={view.backdropUrl} alt="" loading="lazy" />
          <div className="detail-page__backdrop-overlay" />
        </div>
      )}
      {(view.type === 'movie' || view.type === 'tv') && (
        <div className={`detail-overlay__media-cover${topReady ? ' detail-overlay__media-cover--hidden' : ''}`} aria-hidden="true" />
      )}
      {view.stack.map((entry, index) => {
        const key = entryKey(entry.type, entry.id, entry.season, entry.episode)
        const isTop = index === view.stack.length - 1
        const isReady = isTop && readyKeys.has(key)
        const layerClass = `detail-overlay__scroll${entry.type === 'person' ? ' detail-overlay__scroll--person' : ''}${entry.type === 'episode' ? ' detail-overlay__scroll--episode' : ''}${isTop ? ' detail-overlay__scroll--top' : ''}${isReady ? ' detail-overlay__scroll--ready' : ''}`
        return (
          <div
            key={key}
            className={layerClass}
            style={isTop ? undefined : { display: 'none' }}
          >
            <div className="detail-overlay__content">
              {renderDetail(entry.type, entry.id, entry.season, entry.episode, () => handleLayerLoaded(key))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DetailOverlay