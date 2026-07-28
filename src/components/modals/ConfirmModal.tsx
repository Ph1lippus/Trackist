import React from 'react'

interface ConfirmModalProps {
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
    confirmText?: string
    cancelText?: string
    confirmColor?: 'primary' | 'success' | 'danger'
    disabled?: boolean
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmColor = 'primary',
    disabled = false
}) => {
    if (!isOpen) return null

    const getConfirmColorStyle = () => {
        switch (confirmColor) {
            case 'success':
                return {
                    borderColor: 'rgba(104,255,174,0.3)',
                    color: '#68ffae',
                    hoverBg: 'rgba(104,255,174,0.15)',
                    hoverBorder: '#68ffae',
                    hoverShadow: 'rgba(104, 255, 174, 0.3)'
                }
            case 'danger':
                return {
                    borderColor: 'rgba(255,107,107,0.3)',
                    color: '#ff6b6b',
                    hoverBg: 'rgba(255,107,107,0.15)',
                    hoverBorder: '#ff6b6b',
                    hoverShadow: 'rgba(255, 107, 107, 0.3)'
                }
            default:
                return {
                    borderColor: 'rgba(133,138,227,0.3)',
                    color: 'var(--color-primary)',
                    hoverBg: 'rgba(133,138,227,0.15)',
                    hoverBorder: 'var(--color-primary)',
                    hoverShadow: 'rgba(133, 138, 227, 0.3)'
                }
        }
    }

    const colorStyle = getConfirmColorStyle()

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="confirm-modal-title">{title}</h3>
                <p className="confirm-modal-message">{message}</p>
                <div className="confirm-modal-actions">
                    <button 
                        onClick={onCancel} 
                        className="confirm-modal-btn confirm-modal-btn--cancel"
                    >
                        {cancelText}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="confirm-modal-btn confirm-modal-btn--confirm"
                        disabled={disabled}
                        style={{
                            borderColor: colorStyle.borderColor,
                            color: colorStyle.color,
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer'
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled) {
                                e.currentTarget.style.background = colorStyle.hoverBg
                                e.currentTarget.style.borderColor = colorStyle.hoverBorder
                                e.currentTarget.style.boxShadow = `0 0 8px ${colorStyle.hoverShadow}`
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                e.currentTarget.style.borderColor = colorStyle.borderColor
                                e.currentTarget.style.boxShadow = 'none'
                            }
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmModal