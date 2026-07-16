import React from 'react'
import type { WatchlistEpisode } from '../types'
import { imageUrl } from '../services/tmdbService'

interface EpisodeWatchModalProps {
    episode: WatchlistEpisode
    onClose: () => void
    onMarkSingle: () => void
    onMarkAll: () => void
}

const EpisodeWatchModal: React.FC<EpisodeWatchModalProps> = ({ episode, onClose, onMarkSingle, onMarkAll }) => {
    const stillUrl = episode.still_path ? imageUrl(episode.still_path) : null

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="add-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>
                
                {stillUrl && (
                    <img src={stillUrl} alt="Episode still" style={{ 
                        width: '100%', 
                        height: '200px', 
                        objectFit: 'cover', 
                        borderRadius: '8px', 
                        marginBottom: '1rem' 
                    }} />
                )}
                
                <div className="add-modal__preview" style={{ marginBottom: '0.5rem' }}>
                    <div style={{ 
                        width: '50px', 
                        height: '50px',
                        borderRadius: '8px',
                        background: 'rgba(133,138,227,0.2)',
                        border: '1px solid rgba(133,138,227,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--color-orange)',
                        flexShrink: 0
                    }}>
                        E{episode.episode_number}
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', margin: 0 }}>S{episode.season_number}E{episode.episode_number}</h3>
                        <span className="discover-card__type">{episode.title || 'Episode'}</span>
                    </div>
                </div>
                
                {episode.overview && (
                    <p style={{ 
                        fontSize: '0.85rem', 
                        color: 'rgba(255,255,255,0.7)', 
                        margin: '0.5rem 0 1rem',
                        lineHeight: 1.5
                    }}>
                        {episode.overview}
                    </p>
                )}
                
                <div style={{ 
                    display: 'flex', 
                    gap: '0.75rem', 
                    fontSize: '0.8rem', 
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '1rem'
                }}>
                    {episode.air_date && <span>Air date: {episode.air_date}</span>}
                    {episode.runtime && <span>{episode.runtime} min</span>}
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
