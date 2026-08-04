import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useListsLogic } from '../hooks/useListsLogic'
import MediaCard from '../components/media/MediaCard'
import { VirtuosoGrid } from 'react-virtuoso'
import ConfirmModal from '../components/modals/ConfirmModal'
import { deleteList } from '../services/profileService'

const ListsEditPage: React.FC = () => {
    usePageTitle('Trackist - Lists')
    const { id } = useParams<{ id: string }>()
    const {
        selectedList,
        listItems,
        loading,
        activeTab,
        setActiveTab,
        title,
        setTitle,
        description,
        setDescription,
        isPublic,
        setIsPublic,
        saving,
        isNewList,
        browseLoading,
        browsePage,
        hasMore,
        browseMediaType,
        setBrowseMediaType,
        genres,
        selectedGenre,
        setSelectedGenre,
        sortBy,
        setSortBy,
        watchlistIds,
        reordering,
        isFetchingRef,
        showWatchConfirmModal,
        pendingWatchItem,
        isWatchOperation,
        showDeleteModal,
        pendingDeleteItem,
        filteredListItems,
        filteredBrowseResults,
        Footer,
        handleSave,
        handleAddToList,
        handleDeleteItem,
        confirmWatchAction,
        cancelWatchAction,
        confirmDeleteItem,
        cancelDeleteItem,
        handleMoveUp,
        handleMoveDown,
        loadListDetails,
        fetchBrowseData,
        fetchWatchlistIds,
        initNewList,
        committedQuery,
        navigate,
    } = useListsLogic()

    // Load list details when editing an existing list
    useEffect(() => {
        if (id && id !== 'new') {
            loadListDetails(id)
        } else if (id === 'new') {
            initNewList()
        }
        fetchWatchlistIds()
    }, [id, loadListDetails, fetchWatchlistIds, initNewList])

    // Fetch browse data when on edit page
    useEffect(() => {
        const fetchData = async () => {
            if (selectedList || isNewList) {
                await fetchBrowseData(1, true)
            }
        }
        fetchData()
    }, [selectedList, isNewList, browseMediaType, sortBy, selectedGenre, committedQuery, fetchBrowseData])

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

    return (
        <div className="lists-page lists-page--split">
            {/* Left side: Form + List Items */}
            <div className="lists-page__form-section">
                <div className="lists-page__form-header">
                    <h1>{isNewList ? 'Create New List' : 'Edit List'}</h1>
                </div>

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
                            maxLength={500}
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
                            onClick={() => {
                                if (isNewList) {
                                    navigate('/Lists')
                                } else {
                                    navigate(`/ListsDetail/${selectedList!.id}`)
                                }
                            }}
                        >
                            Cancel
                        </button>
                        {!isNewList && (
                            <button
                                className="lists-page__action-btn lists-page__action-btn--danger"
                                onClick={async () => {
                                    if (confirm('Are you sure you want to delete this list?')) {
                                        const { error } = await deleteList(selectedList!.id)
                                        if (!error) {
                                            navigate('/Lists')
                                        }
                                    }
                                }}
                            >
                                Delete List
                            </button>
                        )}
                        <button
                            className="lists-page__action-btn lists-page__action-btn--primary"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : (isNewList ? 'Create List' : 'Save Changes')}
                        </button>
                    </div>
                </div>

                {/* List Items Section - Show ALL items including watched */}
                <div className="lists-page__items-section">
                    <div className="lists-page__items-header">
                        <h2>List Items ({listItems.length})</h2>
                        <div className="lists-page__tabs">
                            <button
                                className={`lists-page__tab ${activeTab === 'all' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                All ({listItems.length})
                            </button>
                            <button
                                className={`lists-page__tab ${activeTab === 'movie' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('movie')}
                            >
                                <i className="fa-solid fa-film"></i> Movies ({listItems.filter(i => i.media_type === 'movie').length})
                            </button>
                            <button
                                className={`lists-page__tab ${activeTab === 'tv' ? 'lists-page__tab--active' : ''}`}
                                onClick={() => setActiveTab('tv')}
                            >
                                <i className="fa-solid fa-tv"></i> TV Shows ({listItems.filter(i => i.media_type === 'tv' || i.media_type === 'anime').length})
                            </button>
                        </div>
                    </div>

                    {filteredListItems.length === 0 ? (
                        <div className="lists-page__empty-state">
                            <i className="fa-solid fa-film"></i>
                            <p>This list is empty. Use the search bar to find content to add!</p>
                        </div>
                    ) : (
                        <div className="lists-page__items-grid">
                            {filteredListItems.map((item, index) => (
                                <div key={item.id} className="lists-page__item-wrapper">
                                    <div className="lists-page__reorder-controls">
                                        <button
                                            className="lists-page__reorder-btn"
                                            onClick={() => handleMoveUp(item, index)}
                                            disabled={index === 0 || reordering === item.id}
                                            title="Move up"
                                        >
                                            <i className="fa-solid fa-arrow-up"></i>
                                        </button>
                                        <button
                                            className="lists-page__reorder-btn"
                                            onClick={() => handleMoveDown(item, index)}
                                            disabled={index === listItems.length - 1 || reordering === item.id}
                                            title="Move down"
                                        >
                                            <i className="fa-solid fa-arrow-down"></i>
                                        </button>
                                    </div>
                                    <MediaCard
                                        item={{
                                            id: item.tmdb_id,
                                            title: item.title,
                                            poster_path: item.poster_path,
                                            media_type: item.media_type
                                        }}
                                        isInWatchlist={watchlistIds.has(item.tmdb_id)}
                                        listMode={true}
                                        onDelete={() => handleDeleteItem(item)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
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
                    <div className="discover-sorts">
                        <select
                            className="discover-filter-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        >
                            <option value="popularity.desc">Popularity (High to Low)</option>
                            <option value="popularity.asc">Popularity (Low to High)</option>
                            <option value="vote_average.desc">Rating (High to Low)</option>
                            <option value="vote_average.asc">Rating (Low to High)</option>
                            <option value="release_date.desc">Release Date (Newest)</option>
                            <option value="release_date.asc">Release Date (Oldest)</option>
                            <option value="original_title.asc">Title (A-Z)</option>
                            <option value="original_title.desc">Title (Z-A)</option>
                        </select>
                        <select
                            className="discover-filter-select"
                            value={selectedGenre ?? ''}
                            onChange={(e) => setSelectedGenre(e.target.value ? Number(e.target.value) : null)}
                        >
                            <option value="">All Genres</option>
                            {genres.map(genre => (
                                <option key={genre.id} value={genre.id}>
                                    {genre.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {browseLoading && browsePage === 1 ? (
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading...</p>
                    </div>
                ) : filteredBrowseResults.length === 0 ? (
                    <div className="discover-empty">
                        <p>No content to add</p>
                    </div>
                ) : (
                    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                        <VirtuosoGrid
                            computeItemKey={(index) => filteredBrowseResults[index]?.id ?? index}
                            style={{ height: '100%', width: '100%' }}
                            data={filteredBrowseResults}
                            endReached={() => {
                                if (hasMore && !isFetchingRef.current) {
                                    fetchBrowseData(browsePage + 1)
                                }
                            }}
                            components={{ Footer }}
                            useWindowScroll={true}
                            listClassName="discover-grid"
                            itemContent={(index) => {
                                const item = filteredBrowseResults[index]
                                return (
                                    <MediaCard
                                        item={item}
                                        onAddToList={handleAddToList}
                                        isInWatchlist={false}
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
        </div>
    )
}

export default ListsEditPage
