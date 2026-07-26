import React, { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import type { TMDBResult, UserList } from '../../types'

interface AddToListModalProps {
    isOpen: boolean
    onClose: () => void
    item: TMDBResult
}

const AddToListModal: React.FC<AddToListModalProps> = ({ isOpen, onClose, item }) => {
    const [lists, setLists] = useState<UserList[]>([])
    const [loading, setLoading] = useState(false)
    const [adding, setAdding] = useState<string | null>(null)

    const fetchLists = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setLoading(true)
        const { data, error } = await supabase
            .from('lists')
            .select('*')
            .eq('user_id', user.id)
            .order('title', { ascending: true })

        if (!error && data) {
            setLists(data)
        }
        setLoading(false)
    }

    const handleAddToList = async (listId: string) => {
        setAdding(listId)
        
        const { error } = await supabase
            .from('list_items')
            .insert({
                list_id: listId,
                tmdb_id: item.id,
                media_type: item.media_type === 'tv' ? 'tv' : 'movie',
                title: item.title || item.name || 'Untitled',
                poster_path: item.poster_path
            })

        if (!error) {
            onClose()
        }
        setAdding(null)
    }

    useEffect(() => {
        const loadLists = async () => {
            if (isOpen) {
                await fetchLists()
            }
        }
        loadLists()
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Add to List</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                
                <div className="modal-body">
                    <p style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.7)' }}>
                        Add "{item.title || item.name}" to one of your lists:
                    </p>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading lists...</div>
                    ) : lists.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            <p>No lists found. Create a list first!</p>
                        </div>
                    ) : (
                        <div className="list-selector">
                            {lists.map(list => (
                                <button
                                    key={list.id}
                                    className={`list-selector-item ${adding === list.id ? 'list-selector-item--loading' : ''}`}
                                    onClick={() => handleAddToList(list.id)}
                                    disabled={adding !== null}
                                >
                                    <div className="list-selector-item-content">
                                        <h3>{list.title}</h3>
                                        {list.description && <p>{list.description}</p>}
                                    </div>
                                    {adding === list.id ? (
                                        <span>Adding...</span>
                                    ) : (
                                        <span>+</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AddToListModal
