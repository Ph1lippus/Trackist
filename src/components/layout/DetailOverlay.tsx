import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import useDetailModalStore, { getDetailBaseTitle, setDetailBaseTitle } from '../../stores/detailModalStore'
import MovieDetail from '../../pages/MovieDetail'
import TVShowDetail from '../../pages/TVShowDetail'
import PersonDetail from '../../pages/PersonDetail'
import EpisodeDetail from '../../pages/EpisodeDetail'

const DetailOverlay: React.FC = () => {
  const { isOpen, type, id, season, episode, backdropUrl, close } = useDetailModalStore()
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const lastRouterPath = useRef(location.pathname)

  // Close the modal when a real React Router navigation happens underneath it
  // (e.g. secondary navbar / bottom nav tabs). Modal entries use pushState that
  // React Router never sees, so the router pathname only changes on real nav.
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

  useEffect(() => {
    if (!isOpen) return

    const handlePopState = () => {
      const epMatch = window.location.pathname.match(/^\/tv\/(\d+)\/season\/(\d+)\/episode\/(\d+)/)
      const match = window.location.pathname.match(/^\/(movie|tv|person)\/(\d+)/)
      if (epMatch) {
        useDetailModalStore.getState().syncFromURL('episode', parseInt(epMatch[1]), parseInt(epMatch[2]), parseInt(epMatch[3]))
      } else if (match) {
        useDetailModalStore.getState().syncFromURL(match[1] as 'movie' | 'tv' | 'person', parseInt(match[2]))
      } else {
        close()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isOpen, close])

  // Escape closes the modal (skipped while a higher-layer confirm modal is open)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('.confirm-modal-overlay')) return
      close()
      window.history.back()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

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
  // base title is captured in open()/syncFromURL(); if the modal was closed by
  // a real navigation, the route-change effect above already re-set the base to
  // the new page's title, so this becomes a no-op instead of clobbering it.
  useEffect(() => {
    if (isOpen) return
    document.title = getDetailBaseTitle() || document.title
  }, [isOpen])

  // Scroll the overlay to the top whenever the content changes
  useEffect(() => {
    if (isOpen && id) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0
      })
    }
  }, [isOpen, id, type, season, episode])

  if (!isOpen || !type || id == null) return null

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`${type} details`}>
      {backdropUrl && type !== 'person' && (
        <div className="detail-page__backdrop">
          <img src={backdropUrl} alt="" loading="lazy" />
          <div className="detail-page__backdrop-overlay" />
        </div>
      )}
      <div
        className={`detail-overlay__scroll${type === 'person' ? ' detail-overlay__scroll--person' : ''}`}
        ref={scrollRef}
      >
        <div className="detail-overlay__content">
          {type === 'movie' && <MovieDetail itemId={id} />}
          {type === 'tv' && <TVShowDetail itemId={id} />}
          {type === 'person' && <PersonDetail itemId={id} />}
          {type === 'episode' && season != null && episode != null && (
            <EpisodeDetail itemId={id} seasonNumber={season} episodeNumber={episode} />
          )}
        </div>
      </div>
    </div>
  )
}

export default DetailOverlay