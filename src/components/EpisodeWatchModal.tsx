import React from 'react'
import type { WatchlistEpisode } from '../types'

interface EpisodeWatchModalProps {
    episode: WatchlistEpisode
    onClose: () => void
    onMarkSingle: () => void
    onMarkAll: () => void
}

const EpisodeWatchModal: React.FC<EpisodeWatchModalProps> = ({ episode, onClose, onMarkSingle, onMarkAll }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="add-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>
                <div className="add-modal__preview">
                    <div style={{ 
                        width: '60px', 
                        height: '60px',
                        borderRadius: '8px',
                        background: 'rgba(133,138,227,0.2)',
                        border: '1px solid rgba(133,138,227,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: 'var(--color-orange)'
                    }}>
                        {episode.episode_number}
                    </div>
                    <div>
                        <h3>S{episode.season_number}E{episode.episode_number}</h3>
                        <span className="discover-card__type">{episode.title || 'Episode'}</span>
                    </div>
                </div>
                <p className="add-modal__question">Mark this episode as watched?</p>
                <div className="add-modal__actions">
                    <button className="add-modal__btn add-modal__btn--no" onClick={onMarkSingle}>
                        Just this one
                    </button>
                    <button className="add-modal__btn add-modal__btn--yes" onClick={onMarkAll}>
                        All remaining
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EpisodeWatchModal