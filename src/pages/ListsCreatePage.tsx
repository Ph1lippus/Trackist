import React, { useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useListsLogic } from '../hooks/useListsLogic'
import MediaCard from '../components/media/MediaCard'
import { VirtuosoGrid } from 'react-virtuoso'
import ConfirmModal from '../components/modals/ConfirmModal'
import { useMobile } from '../contexts/useMobile'
import type { TMDBResult } from '../types'

// Memoized item renderer to prevent re-mounts during scroll
const BrowseCard = memo(({ item, onAdd }: { 
    item: TMDBResult
    onAdd: (item: TMDBResult) => void
}) => (
    <MediaCard
        item={item}
        onAddToList={onAdd}
        isInWatchlist={false}
        forceActionIcons={true}
    />
))

const ListsCreatePage: React.FC = () => {
    usePageTitle('Track1st - Create List')
    const navigate = useNavigate()
    const { isMobile } = useMobile()
    
    const {
        title,
        setTitle,
        description,
        setDescription,
        isPublic,
        setIsPublic,
        saving,
        browseLoading,
        browsePage,
        hasMore,
        browseMediaType,
        setBrowseMediaType,
        isFetchingRef,
        filteredBrowseResults,
        Footer,
        handleSave,
        handleAddToList,
        showWatchConfirmModal,
        pendingWatchItem,
        isWatchOperation,
        confirmWatchAction,
        cancelWatchAction,
        fetchBrowseData,
        fetchWatchlistIds,
        initNewList,
    } = useListsLogic()

    // Initialize new list and fetch browse data on mount
    useEffect(() => {
        initNewList()
        fetchWatchlistIds()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initNewList, fetchWatchlistIds])

    useEffect(() => {
        fetchBrowseData(1, true)
        // Fetch again whenever the Movies/TV Shows browse tab changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [browseMediaType])

    const handleCreate = async () => {
        await handleSave()
        // handleSave will navigate to the new list detail page
    }

    return (
        <div className="lists-page lists-page--split">
            {/* Left side: Form + List Items */}
            <div className="lists-page__form-section">
                <div className="lists-page__form">
                    <div className="form-group">
                        <label htmlFor="listTitle">Title *</label>
                        <input
                            id="listTitle"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="My Awesome List"
                            maxLength={100}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="listDescription">Description</label>
                        <textarea
                            id="listDescription"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this list about?"
                            rows={4}
                            maxLength={2500}
                        />
                    </div>
                    <div className="form-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                            />
                            <span>Make this list public</span>
                        </label>
                    </div>
                    <div className="lists-page__form-actions">
                        <button
                            className="lists-page__action-btn"
                            onClick={() => navigate('/Lists')}
                        >
                            Cancel
                        </button>
                        <button
                            className="lists-page__action-btn lists-page__action-btn--primary"
                            onClick={handleCreate}
                            disabled={saving}
                        >
                            {saving ? 'Creating...' : 'Create List'}
                        </button>
                    </div>
                </div>

                {/* List Items Section - Empty for new list */}
                <div className="lists-page__items-section">
                    <div className="lists-page__items-header">
                    </div>
                    <div className="lists-page__empty-state">
                        <i className="fa-solid fa-film"></i>
                        <p>This list is empty. Use the search bar to find content to add!</p>
                    </div>
                </div>
            </div>

            {/* Right side: Browse grid for adding items */}
            <div className="lists-page__discover-section">
                <div className="lists-page__discover-header">
                    <h2>Add Content</h2>
                    <p>Use the search bar above to find movies and TV shows to add to your list</p>
                </div>

                {/* Browse tabs */}
                <div className="discover-controls">
                    <div className="discover-tabs">
                        <button
                            className={`discover-tab ${browseMediaType === 'movie' ? 'active' : ''}`}
                            onClick={() => setBrowseMediaType('movie')}
                        >
                            Movies
                        </button>
                        <button
                            className={`discover-tab ${browseMediaType === 'tv' ? 'active' : ''}`}
                            onClick={() => setBrowseMediaType('tv')}
                        >
                            TV Shows
                        </button>
                    </div>
                </div>

                {browseLoading && browsePage === 1 ? (
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading...</p>
                    </div>
                ) : filteredBrowseResults.length === 0 ? (
                    <div className="lists-page__empty-state">
                        <p>No content to add</p>
                    </div>
                ) : (
                    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                        <VirtuosoGrid
                            computeItemKey={(index) => filteredBrowseResults[index]?.id ?? index}
                            style={{ width: '100%' }}
                            data={filteredBrowseResults}
                            rangeChanged={(range) => {
                                // Load more items when user scrolls near the end
                                // This fires continuously during scrolling (unlike endReached which only fires on mobile when finger lifts)
                                const { endIndex } = range
                                const totalItems = filteredBrowseResults.length
                                const threshold = isMobile ? 15 : 20 // Load more when within 15-20 items of the end
                                
                                if (endIndex >= totalItems - threshold && hasMore && !isFetchingRef.current) {
                                    fetchBrowseData(browsePage + 1)
                                }
                            }}
                            components={{ Footer }}
                            useWindowScroll={true}
                            increaseViewportBy={{
                                top: isMobile ? 50 : 100,
                                bottom: isMobile ? 100 : 200,
                            }}
                            overscan={isMobile ? 20 : 40}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = filteredBrowseResults[index]
                                if (!item) return null
                                return (
                                    <BrowseCard
                                        item={item}
                                        onAdd={handleAddToList}
                                    />
                                )
                            }}
                        />
                    </div>
                )}
            </div>

            {showWatchConfirmModal && (
                <ConfirmModal
                    isOpen={showWatchConfirmModal}
                    title={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
                    message={isWatchOperation
                        ? `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as watched?`
                        : `Are you sure you want to mark "${pendingWatchItem?.title || pendingWatchItem?.name}" as unwatched?`}
                    onConfirm={confirmWatchAction}
                    onCancel={cancelWatchAction}
                    confirmText={isWatchOperation ? 'Mark as Watched' : 'Mark as Unwatched'}
                    confirmColor={isWatchOperation ? 'success' : 'primary'}
                />
            )}
        </div>
    )
}

export default ListsCreatePage