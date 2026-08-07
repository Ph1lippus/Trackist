import React, { useState, useEffect, ReactNode } from 'react'

interface ConfirmModalProps {
    isOpen: boolean
    title: string
    message: ReactNode
    onConfirm: () => void
    onCancel: () => void
    confirmText?: string
    cancelText?: string
    confirmColor?: 'primary' | 'success' | 'danger'
    disabled?: boolean
    confirmLoading?: boolean
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
    disabled = false,
    confirmLoading = false
}) => {
    const [isAnimatingOut, setIsAnimatingOut] = useState(false)
    const [shouldRender, setShouldRender] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true)
            setIsAnimatingOut(false)
        } else {
            setIsAnimatingOut(true)
            const timer = setTimeout(() => {
                setShouldRender(false)
            }, 150) // Match animation duration
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    if (!shouldRender) return null

    const isDisabled = disabled || confirmLoading

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

    const overlayAnimation = isAnimatingOut ? 'confirmOverlayOut 0.15s ease-in forwards' : 'confirmOverlayIn 0.15s ease-out'
    const modalAnimation = isAnimatingOut ? 'confirmModalOut 0.15s ease-in forwards' : 'confirmModalIn 0.15s ease-out'

    return (
        <div 
            className="confirm-modal-overlay" 
            onClick={confirmLoading ? undefined : onCancel}
            style={{ animation: overlayAnimation }}
        >
            <div 
                className="confirm-modal-content" 
                onClick={(e) => e.stopPropagation()}
                style={{ animation: modalAnimation }}
            >
                <h3 className="confirm-modal-title">{title}</h3>
                <p className="confirm-modal-message">{message}</p>
                <div className="confirm-modal-actions">
                    <button
                        onClick={onCancel}
                        className="confirm-modal-btn confirm-modal-btn--cancel"
                        disabled={isDisabled}
                        style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="confirm-modal-btn confirm-modal-btn--confirm"
                        disabled={isDisabled}
                        style={{
                            borderColor: colorStyle.borderColor,
                            color: colorStyle.color,
                            opacity: isDisabled ? 0.5 : 1,
                            cursor: isDisabled ? 'not-allowed' : 'pointer'
                        }}
                        onMouseEnter={(e) => {
                            if (!isDisabled) {
                                e.currentTarget.style.background = colorStyle.hoverBg
                                e.currentTarget.style.borderColor = colorStyle.hoverBorder
                                e.currentTarget.style.boxShadow = `0 0 8px ${colorStyle.hoverShadow}`
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isDisabled) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                e.currentTarget.style.borderColor = colorStyle.borderColor
                                e.currentTarget.style.boxShadow = 'none'
                            }
                        }}
                    >
                        {confirmLoading ? (
                            <span className="modal-btn-spinner" style={{ borderTopColor: colorStyle.color }} />
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmModal