import React, { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useSelectionStore } from '../stores/useSelectionStore'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { WatchlistItem, TMDBResult } from '../types'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { Virtuoso } from 'react-virtuoso'
import { removeAllWatchedEpisodes } from '../services/watchlistService'
import { useMobile } from '../contexts/useMobile'

type FlatItem =
    | { type: 'header'; title: string; key: string }
    | { type: 'cards'; items: WatchlistItem[]; section: string; key: string }

const Finished: React.FC = () => {
    usePageTitle('Trackist - Finished')
    const { committedQuery } = useSearch()

    const finished = useLibraryStore((state) => state.finished)

    const [unwatchModal, setUnwatchModal] = useState<{
        isOpen: boolean
        item: WatchlistItem
        isTV: boolean
    } | null>(null)
    const [unwatchLoading, setUnwatchLoading    ] = useState(false)

    const {
        finishedSelectionMode: selectionMode,
        finishedSelectedIds: selectedIds,
        toggleFinishedSelection: toggleSelection
    } = useSelectionStore()

    const { isMobile } = useMobile()

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const filteredItems = useMemo(() => {
        if (!committedQuery) return finished
        return finished.filter(item => item.title.toLowerCase().includes(committedQuery.toLowerCase()))
    }, [finished, committedQuery])

    const finishedMovies = useMemo(() => filteredItems.filter(item => item.media_type === 'movie' && item.status !== 'dropped').sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const finishedTVShows = useMemo(() => filteredItems.filter(item => (item.media_type === 'tv' || item.media_type === 'anime') && item.status !== 'dropped').sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const pausedItems = useMemo(() => filteredItems.filter(item => item.status === 'paused').sort((a, b) => {
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])
    const droppedItems = useMemo(() => filteredItems.filter(item => item.status === 'dropped').sort((a, b) => {
        const dateA = new Date(a.updated_at || 0)
        const dateB = new Date(b.updated_at || 0)
        return dateB.getTime() - dateA.getTime()
    }), [filteredItems])

    const flatItems = useMemo<FlatItem[]>(() => {
        const items: FlatItem[] = []
        const batchSize = isMobile ? 2 : 4

        const addSection = (title: string, sectionItems: WatchlistItem[], sectionKey: string) => {
            if (sectionItems.length === 0) return
            items.push({ type: 'header', title, key: `header-${sectionKey}` })
            for (let i = 0; i < sectionItems.length; i += batchSize) {
                items.push({
                    type: 'cards',
                    items: sectionItems.slice(i, i + batchSize),
                    section: sectionKey,
                    key: `row-${sectionKey}-${i}`
                })
            }
        }

        addSection('Finished TV Shows', finishedTVShows, 'finished-tv')
        addSection('Finished Movies', finishedMovies, 'finished-movies')
        addSection('Paused', pausedItems, 'paused')
        addSection('Dropped', droppedItems, 'dropped')

        return items
    }, [finishedTVShows, finishedMovies, pausedItems, droppedItems, isMobile])

    const buildTmdbItem = (item: WatchlistItem): TMDBResult => ({
        id: item.tmdb_id as number,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type === 'anime' ? 'tv' : item.media_type
    })

    const handleUnwatchMovie = async (item: WatchlistItem) => {
        await useLibraryStore.getState().updateStatus(item.id, 'planning')
        await useLibraryStore.getState().refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchTVShow = async (item: WatchlistItem) => {
        await removeAllWatchedEpisodes(item.id)
        await useLibraryStore.getState().refreshItem(item.id)
        setUnwatchModal(null)
    }

    const handleUnwatchConfirm = async () => {
        if (!unwatchModal) return

        setUnwatchLoading(true)
        try {
            if (unwatchModal.isTV) {
                await handleUnwatchTVShow(unwatchModal.item)
            } else {
                await handleUnwatchMovie(unwatchModal.item)
            }
        } finally {
            setUnwatchLoading(false)
        }
    }

    if (flatItems.length === 0) {
        return (
            <div className="discover-page">
                <div className="discover-container" style={{ width: '85%' }}>
                    <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        No finished movies, TV shows, or paused items yet. Complete some from your watchlist!
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="discover-page">
            <div className="discover-container" style={{ width: '85%' }}>
                <Virtuoso
                    useWindowScroll={true}
                    data={flatItems}
                    computeItemKey={(index) => flatItems[index]?.key ?? index}
                    overscan={isMobile ? 20 : 40}
                    itemContent={(index, item) => {
                        if (item.type === 'header') {
                            return (
                                <div className="watchlist-section__header">
                                    <h3 className="watchlist-section__title">{item.title}</h3>
                                </div>
                            )
                        }

                        const isTV = item.section === 'finished-tv' || item.section === 'paused'

                        return (
                            <div className="discover-grid">
                                {item.items.map(cardItem => {
                                    const isSelected = selectedIds.has(cardItem.id)

                                    return (
                                        <div key={cardItem.id} style={{ position: 'relative' }}>
                                            <MediaCard
                                                item={buildTmdbItem(cardItem)}
                                                selected={selectionMode && isSelected}
                                                selectable={selectionMode}
                                                onSelect={() => toggleSelection(cardItem.id)}
                                                isInWatchlist={true}
                                                onAdd={selectionMode ? undefined : () => {}}
                                                onMarkUnwatched={selectionMode ? undefined : () => setUnwatchModal({ isOpen: true, item: cardItem, isTV })}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    }}
                />
            </div>

            <button className="upcoming-new-scroll-top" onClick={scrollToTop} aria-label="Scroll to top" title="Back to top">
                <i className="fas fa-arrow-up"></i>
            </button>

            {unwatchModal && (
                <ConfirmModal
                    isOpen={unwatchModal.isOpen}
                    title={unwatchModal.isTV ? 'Remove All Episodes' : 'Move Back to Watchlist'}
                    message={
                        unwatchModal.isTV
                            ? `Are you sure you want to remove all watched episodes from "${unwatchModal.item.title}" and move it back to your watchlist?`
                            : `Are you sure you want to move "${unwatchModal.item.title}" back to your watchlist?`
                    }
                    onConfirm={handleUnwatchConfirm}
                    onCancel={() => setUnwatchModal(null)}
                    confirmText="Yes, Remove"
                    cancelText="Cancel"
                    confirmColor="danger"
                    confirmLoading={unwatchLoading}
                />
            )}
        </div>
    )
}

export default Finished
