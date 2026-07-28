import React from 'react'

interface EpisodeChoiceModalProps {
    isOpen: boolean
    title: string
    message: string
    onMarkAll: () => void
    onMarkOne: () => void
    onCancel: () => void
}

const EpisodeChoiceModal: React.FC<EpisodeChoiceModalProps> = ({
    isOpen,
    title,
    message,
    onMarkAll,
    onMarkOne,
    onCancel
}) => {
    if (!isOpen) return null

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="confirm-modal-title">{title}</h3>
                <p className="confirm-modal-message">{message}</p>
                <div className="confirm-modal-actions">
                    <button 
                        onClick={onMarkOne} 
                        className="confirm-modal-btn confirm-modal-btn--confirm"
                        style={{
                            borderColor: 'rgba(104,255,174,0.3)',
                            color: '#68ffae'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(104,255,174,0.15)'
                            e.currentTarget.style.borderColor = '#68ffae'
                            e.currentTarget.style.boxShadow = '0 0 8px rgba(104, 255, 174, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.borderColor = 'rgba(104,255,174,0.3)'
                            e.currentTarget.style.boxShadow = 'none'
                        }}
                    >
                        Mark Only This One
                    </button>
                    <button 
                        onClick={onMarkAll} 
                        className="confirm-modal-btn confirm-modal-btn--confirm"
                        style={{
                            borderColor: 'rgba(133,138,227,0.3)',
                            color: 'var(--color-primary)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(133,138,227,0.15)'
                            e.currentTarget.style.borderColor = 'var(--color-primary)'
                            e.currentTarget.style.boxShadow = '0 0 8px rgba(133, 138, 227, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.borderColor = 'rgba(133,138,227,0.3)'
                            e.currentTarget.style.boxShadow = 'none'
                        }}
                    >
                        Mark All Before
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EpisodeChoiceModal
