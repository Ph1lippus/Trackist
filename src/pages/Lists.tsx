import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import type { UserList, ListItem } from '../types'
import MediaCard from '../components/media/MediaCard'

const Lists: React.FC = () => {
    const [lists, setLists] = useState<UserList[]>([])
    const [selectedList, setSelectedList] = useState<UserList | null>(null)
    const [listItems, setListItems] = useState<ListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newListName, setNewListName] = useState('')
    const [newListDescription, setNewListDescription] = useState('')
    const [newListPublic, setNewListPublic] = useState(false)
    const [creating, setCreating] = useState(false)

    const fetchLists = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('lists')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })

        if (!error && data) {
            setLists(data)
        }
        setLoading(false)
    }

    const fetchListItems = async (listId: string) => {
        const { data, error } = await supabase
            .from('list_items')
            .select('*')
            .eq('list_id', listId)
            .order('added_at', { ascending: false })

        if (!error && data) {
            setListItems(data)
        }
    }

    const handleCreateList = async (e: React.FormEvent) => {
        e.preventDefault()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !newListName.trim()) return

        setCreating(true)
        const { error } = await supabase
            .from('lists')
            .insert({
                user_id: user.id,
                title: newListName.trim(),
                description: newListDescription.trim() || null,
                is_public: newListPublic
            })

        if (!error) {
            setNewListName('')
            setNewListDescription('')
            setNewListPublic(false)
            setShowCreateModal(false)
            fetchLists()
        }
        setCreating(false)
    }

    const handleDeleteList = async (listId: string) => {
        if (!confirm('Are you sure you want to delete this list?')) return

        const { error } = await supabase
            .from('lists')
            .delete()
            .eq('id', listId)

        if (!error) {
            if (selectedList?.id === listId) {
                setSelectedList(null)
                setListItems([])
            }
            fetchLists()
        }
    }

    const handleRemoveItem = async (itemId: string) => {
        const { error } = await supabase
            .from('list_items')
            .delete()
            .eq('id', itemId)

        if (!error && selectedList) {
            fetchListItems(selectedList.id)
        }
    }

    const handleSelectList = (list: UserList) => {
        setSelectedList(list)
        fetchListItems(list.id)
    }

    useEffect(() => {
        const loadLists = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('user_lists')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })

            if (!error && data) {
                setLists(data)
            }
            setLoading(false)
        }
        loadLists()
    }, [])

    if (loading) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
                </div>
            </section>
        )
    }

    return (
        <div className="lists-page">
            <div className="lists-page__container">
                <div className="lists-page__sidebar">
                    <div className="lists-page__header">
                        <h1>My Lists</h1>
                        <button 
                            className="lists-page__create-btn"
                            onClick={() => setShowCreateModal(true)}
                        >
                            + Create List
                        </button>
                    </div>

                    <div className="lists-page__list">
                        {lists.length === 0 ? (
                            <p className="lists-page__empty">No lists yet. Create your first list!</p>
                        ) : (
                            lists.map(list => (
                                <div
                                    key={list.id}
                                    className={`lists-page__list-item ${selectedList?.id === list.id ? 'lists-page__list-item--active' : ''}`}
                                    onClick={() => handleSelectList(list)}
                                >
                                    <div className="lists-page__list-item-content">
                                        <h3>{list.title}</h3>
                                        {list.description && <p>{list.description}</p>}
                                        <div className="lists-page__list-item-meta">
                                            <span>{list.is_public ? '🌐 Public' : '🔒 Private'}</span>
                                        </div>
                                    </div>
                                    <button
                                        className="lists-page__delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteList(list.id)
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lists-page__main">
                    {selectedList ? (
                        <>
                            <div className="lists-page__list-header">
                                <h2>{selectedList.title}</h2>
                                {selectedList.description && <p>{selectedList.description}</p>}
                                <span className={`lists-page__visibility-badge ${selectedList.is_public ? 'public' : 'private'}`}>
                                    {selectedList.is_public ? 'Public' : 'Private'}
                                </span>
                            </div>

                            {listItems.length === 0 ? (
                                <p className="lists-page__empty">This list is empty. Add movies and TV shows to it!</p>
                            ) : (
                                <div className="discover-grid">
                                    {listItems.map(item => (
                                        <div key={item.id} className="lists-page__item-wrapper">
                                            <MediaCard
                                                item={{
                                                    id: item.tmdb_id,
                                                    title: item.title,
                                                    poster_path: item.poster_path,
                                                    media_type: item.media_type
                                                }}
                                                isInWatchlist={false}
                                                onAdd={() => {}}
                                                onMarkWatched={() => {}}
                                            />
                                            <button
                                                className="lists-page__remove-item-btn"
                                                onClick={() => handleRemoveItem(item.id)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="lists-page__placeholder">
                            <h2>Select a list to view its contents</h2>
                            <p>Or create a new list to get started</p>
                        </div>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Create New List</h2>
                        <form onSubmit={handleCreateList}>
                            <div className="form-group">
                                <label>List Name *</label>
                                <input
                                    type="text"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    required
                                    placeholder="My Favorite Movies"
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={newListDescription}
                                    onChange={(e) => setNewListDescription(e.target.value)}
                                    placeholder="A brief description of your list..."
                                    rows={3}
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newListPublic}
                                        onChange={(e) => setNewListPublic(e.target.checked)}
                                    />
                                    Make this list public
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" disabled={creating}>
                                    {creating ? 'Creating...' : 'Create List'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Lists
