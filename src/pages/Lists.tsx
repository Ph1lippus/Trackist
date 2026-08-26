import React, { useEffect } from 'react'
import { usePageTitle } from '../hooks/usePageTitle'
import { useListsLogic } from '../hooks/useListsLogic'
import { imageUrl } from '../services/tmdbService'

const Lists: React.FC = () => {
    usePageTitle('Trackist - Lists')
    const {
        publicLists,
        filteredLists,
        committedQuery,
        loading,
        fetchLists,
        navigate,
    } = useListsLogic()

    useEffect(() => {
        fetchLists()
    }, [fetchLists])

    return (
        <div className="lists-page">
            <div className="lists-page__container">
                <div className="lists-page__overview-header">
                    <button
                        className="lists-page__create-btn"
                        onClick={() => navigate('/ListsEditPage/new')}
                    >
                        <i className="fa-solid fa-plus"></i> New List
                    </button>
                </div>

                {!loading && filteredLists.length === 0 ? (
                    <p className="lists-page__empty">
                        {committedQuery ? 'No lists match your search' : 'No lists yet. Create your first list!'}
                    </p>
                ) : (
                    <div className="lists-page__grid">
                        {filteredLists.map(list => (
                            <div
                                key={list.id}
                                className="lists-page__card"
                                onClick={() => navigate(`/ListsDetail/${list.id}`)}
                            >
                                <div className="media-card__poster list">
                                        {list.poster ? (
                                            <img src={imageUrl(list.poster, 'w342') ?? undefined} alt={list.title} />   
                                        ) : (
                                            <div className="lists-page__card-placeholder">
                                                <i className="fa-regular fa-images" />
                                            </div>
                                        )}
                                    </div>
                                <div className="lists-page__card-content">
                                    <h3>{list.title}</h3>
                                    {list.description && <p>{list.description}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {publicLists.length > 0 && (
                    <>
                        <div className="lists-page__overview-header" style={{ marginTop: '3rem' }}>
                            <h1>Public Lists</h1>
                        </div>
                        <div className="lists-page__grid">
                            {publicLists.map(list => (
                                <div
                                    key={list.id}
                                    className="lists-page__card"
                                    onClick={() => navigate(`/ListsDetail/${list.id}`)}
                                >
                                    <div className="lists-page__card-content">
                                        <h3>{list.title}</h3>
                                        {list.description && <p>{list.description}</p>}
                                        <div className="lists-page__card-meta">
                                            <span>Public</span>
                                            <span>by {list.profiles?.display_name || 'Anonymous'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default Lists
