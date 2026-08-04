import React, { useEffect } from 'react'
import { usePageTitle } from '../hooks/usePageTitle'
import { useListsLogic } from '../hooks/useListsLogic'

const Lists: React.FC = () => {
    usePageTitle('Trackist - Lists')
    const {
        lists,
        publicLists,
        loading,
        filteredLists,
        committedQuery,
        fetchLists,
        navigate,
    } = useListsLogic()

    useEffect(() => {
        fetchLists()
    }, [fetchLists])

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
        <div className="lists-page">
            <div className="friends-container">
                <div className="lists-page__overview-header">
                    <h1>My Lists</h1>
                    <button
                        className="lists-page__create-btn"
                        onClick={() => navigate('/ListsEditPage/new')}
                    >
                        <i className="fa-solid fa-plus"></i> New List
                    </button>
                </div>

                {filteredLists.length === 0 ? (
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
                                <div className="lists-page__card-content">
                                    <h3>{list.title}</h3>
                                    {list.description && <p>{list.description}</p>}
                                    <div className="lists-page__card-meta">
                                        <span>{list.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                    </div>
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
                                            <span>🌐 Public</span>
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
