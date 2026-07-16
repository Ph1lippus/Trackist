import React, { useState } from 'react'
import { imageUrl } from '../services/tmdbService'
import type { TMDBResult } from '../types'

interface AddModalProps {
    item: TMDBResult
    onClose: () => void
    onAdd: (item: TMDBResult, status: string) => void
}

const AddModal: React.FC<AddModalProps> = ({ item, onClose, onAdd }) => {
    const [adding, setAdding] = useState(false)

    const handleAdd = async (status: string) => {
        setAdding(true)
        await onAdd(item, status)
        setAdding(false)
        onClose()
    }

    const posterUrl = imageUrl(item.poster_path ?? null)
    const title = item.title || item.name || 'Untitled'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="add-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>
                <div className="add-modal__preview">
                    {posterUrl ? (
                        <img src={posterUrl} alt={title} />
                    ) : (
                        <div className="discover-card__no-poster" style={{ width: '80px', height: '120px' }}>
                            <span style={{ fontSize: '0.6rem' }}>{title}</span>
                        </div>
                    )}
                    <div>
                        <h3>{title}</h3>
                        <span className="discover-card__type">{item.media_type}</span>
                    </div>
                </div>
                <p className="add-modal__question">Have you already seen this?</p>
                <div className="add-modal__actions">
                    <button className="add-modal__btn add-modal__btn--no" onClick={() => handleAdd('planning')} disabled={adding}>
                        {adding ? '...' : 'Not yet'}
                    </button>
                    <button className="add-modal__btn add-modal__btn--yes" onClick={() => handleAdd('completed')} disabled={adding}>
                        {adding ? '...' : 'Yes, mark as watched'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AddModal