import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import useDetailModalStore, {
  getDetailBaseTitle,
  setDetailBaseTitle,
} from '../../stores/detailModalStore'
import MovieDetail from '../../pages/MovieDetail'
import TVShowDetail from '../../pages/TVShowDetail'
import PersonDetail from '../../pages/PersonDetail'
import EpisodeDetail from '../../pages/EpisodeDetail'

const entryKey = (type: string, id: number, season?: number, episode?: number): string =>
  `${type}:${id}:${season ?? ''}:${episode ?? ''}`

const renderDetail = (type: string, id: number, season?: number, episode?: number) => {
  switch (type) {
    case 'movie':
      return <MovieDetail itemId={id} />
    case 'tv':
      return <TVShowDetail itemId={id} />
    case 'person':
      return <PersonDetail itemId={id} />
    case 'episode':
      return season != null && episode != null ? (
        <EpisodeDetail itemId={id} seasonNumber={season} episodeNumber={episode} />
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
      console.debug('[DBG-modal] forced close: pathname changed to', location.pathname)
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
      const histState = window.history.state as { idx?: number | null } | null
      console.debug('[DBG-modal] popstate:', 'path=', path, 'pinHref=', s.pinHref, 'stackLen=', s.stack.length, 'histIdx=', histState?.idx ?? null)
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

  // Lock page scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('no-scroll')
    } else {
      document.body.classList.remove('no-scroll')
    }
    return () => {
      document.body.classList.remove('no-scroll')
    }
  }, [isOpen])

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

  if (!isOpen || !type || id == null || stack.length === 0) return null

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`${type} details`}>
      {backdropUrl && type !== 'person' && (
        <div className="detail-page__backdrop">
          <img src={backdropUrl} alt="" loading="lazy" />
          <div className="detail-page__backdrop-overlay" />
        </div>
      )}
      {stack.map((entry, index) => {
        const key = entryKey(entry.type, entry.id, entry.season, entry.episode)
        const isTop = index === stack.length - 1
        return (
          <div
            key={key}
            className={`detail-overlay__scroll${entry.type === 'person' ? ' detail-overlay__scroll--person' : ''}`}
            style={isTop ? undefined : { visibility: 'hidden' }}
          >
            <div className="detail-overlay__content">
              {renderDetail(entry.type, entry.id, entry.season, entry.episode)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DetailOverlay