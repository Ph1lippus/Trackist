import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useListsLogic } from '../hooks/useListsLogic'
import MediaCard from '../components/media/MediaCard'
import { VirtuosoGrid } from 'react-virtuoso'
import ConfirmModal from '../components/modals/ConfirmModal'
import { useMobile } from '../contexts/useMobile'

const ListsDetail: React.FC = () => {
    usePageTitle('Trackist - Lists')
    const { id } = useParams<{ id: string }>()

    const { isMobile } = useMobile()
    const {
        selectedList,
        listItems,
        loading,
        activeTab,
        setActiveTab,
        watchlistIds,
        watchedListItems,
        showWatchConfirmModal,
        pendingWatchItem,
        isWatchOperation,
        showDeleteModal,
        pendingDeleteItem,
        filteredListItems,
        filteredWatchedItems,
        handleMarkWatched,
        confirmWatchAction,
        cancelWatchAction,
        confirmDeleteItem,
        cancelDeleteItem,
        loadListDetails,
        fetchWatchlistIds,
        navigate,
    } = useListsLogic()

    // Load list details when component mounts or id changes
    useEffect(() => {
        async function loadData() {
            if (id) {
                await loadListDetails(id)
            }
            await fetchWatchlistIds()
        }
        loadData()
    }, [id, loadListDetails, fetchWatchlistIds])

    if (loading) {
        return (
            <section className="lists-page">
                <div className="discover-loading">
                    <div className="discover-spinner" />
                    <p>Loading...</p>
                </div>
            </section>
        )
    }

    if (!selectedList) {
        return (
            <section className="lists-page">
                <div className="discover-loading">
                    <div className="discover-spinner" />
                    <p>Loading...</p>
                </div>
            </section>
        )
    }

    return (
        <>
            <div className="lists-page--view">
                <div className="lists-page__view-header">
                    <div className="lists-page__view-header-content">
                        <h1>{selectedList.title}</h1>
                        <p className="lists-page__view-description">{selectedList.description || 'No description'}</p>
                        <div className="lists-page__view-meta">
                            <span>{selectedList.is_public ? 'Public' : 'Private'}</span>
                            <span>•</span>
                            <span>{listItems.length} {listItems.length === 1 ? 'item' : 'items'}</span>
                        </div>
                        <button
                            className="lists-page__action-btn lists-page__action-btn--primary"
                            onClick={() => navigate(`/ListsEditPage/${selectedList.id}`)}
                        >
                            Edit List
                        </button>
                    </div>
                </div>

                <div className="lists-page__view-content">
                    <div className="lists-page__items-header">
                        <div className="lists-page__tabs">
                            <button
                                className={`lists-page__tab ${activeTab === 'all' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                All ({filteredListItems.length})
                            </button>
                            <button
                                className={`lists-page__tab ${activeTab === 'movie' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('movie')}
                            >
                                Movies ({listItems.filter(i => i.media_type === 'movie' && !watchedListItems.has(i.tmdb_id)).length})
                            </button>
                            <button
                                className={`lists-page__tab ${activeTab === 'tv' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('tv')}
                            >
                                TV Shows ({listItems.filter(i => (i.media_type === 'tv' || i.media_type === 'anime') && !watchedListItems.has(i.tmdb_id)).length})
                            </button>
                        </div>
                    </div>

                    {/* Empty state – no items at all */}
{filteredListItems.length === 0 && filteredWatchedItems.length === 0 ? (
    <div className="lists-page__empty-state">
        <i className="fa-solid fa-film"></i>
        <p>This list is empty. Click "Edit List" to add content!</p>
    </div>
) : (
    <>
        {/* Unwatched items section */}
        {filteredListItems.length > 0 && (
            <VirtuosoGrid
                increaseViewportBy={{
                    top: isMobile ? 200 : 400,
                    bottom: isMobile ? 400 : 800,
                }}
                computeItemKey={(index) => filteredListItems[index]?.id ?? index}
                style={{ height: '100%', width: '100%' }}
                useWindowScroll={true}
                data={filteredListItems}
                overscan={isMobile ? 50 : 100}
                listClassName="discover-grid"
                itemContent={(index) => {
                    const item = filteredListItems[index]
                    return (
                        <MediaCard
                            item={{
                                id: item.tmdb_id,
                                title: item.title,
                                poster_path: item.poster_path,
                                media_type: item.media_type
                            }}
                            isInWatchlist={watchlistIds.has(item.tmdb_id)}
                            listMode={true}
                            onMarkWatched={handleMarkWatched}
                            onMarkUnwatched={undefined}
                        />
                    )
                }}
            />
        )}

        {/* Watched items section – always shown if there are any */}
        {filteredWatchedItems.length > 0 && (
            <div className="lists-page__watched-section">
                <h3 className="lists-page__watched-title">
                    <i className="fa-solid fa-eye"></i> Watched ({filteredWatchedItems.length})
                    {filteredListItems.length === 0 && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'normal', color: 'rgba(255,255,255,0.5)' }}>
                            – All items in this list have been watched!
                        </span>
                    )}
                </h3>
                <VirtuosoGrid
                    increaseViewportBy={{
                        top: isMobile ? 600 : 1200,
                        bottom: isMobile ? 2000 : 3000,
                    }}
                    computeItemKey={(index) => filteredWatchedItems[index]?.id ?? index}
                    style={{ height: '100%', width: '100%' }}
                    useWindowScroll={true}
                    data={filteredWatchedItems}
                    overscan={isMobile ? 50 : 100}
                    listClassName="discover-grid"
                    itemContent={(index) => {
                        const item = filteredWatchedItems[index]
                        return (
                            <MediaCard
                                item={{
                                    id: item.tmdb_id,
                                    title: item.title,
                                    poster_path: item.poster_path,
                                    media_type: item.media_type
                                }}
                                isInWatchlist={watchlistIds.has(item.tmdb_id)}
                                listMode={true}
                                onMarkUnwatched={handleMarkWatched}
                                onMarkWatched={undefined}
                            />
                        )
                    }}
                />
            </div>
        )}
    </>
)}
                </div>
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
            {showDeleteModal && (
                <ConfirmModal
                    isOpen={showDeleteModal}
                    title="Remove from List"
                    message={`Are you sure you want to remove "${pendingDeleteItem?.title}" from this list?`}
                    onConfirm={confirmDeleteItem}
                    onCancel={cancelDeleteItem}
                    confirmText="Remove"
                    confirmColor="danger"
                />
            )}
        </>
    )
}

export default ListsDetail
