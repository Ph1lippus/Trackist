import React, { useState, useEffect } from 'react'

interface PWAUpdateModalProps {
    isOpen: boolean
    onUpdate: () => void
    onDismiss: () => void
    version?: string
    confirmLoading?: boolean
    confirmText?: string
    cancelText?: string
}

const PWAUpdateModal: React.FC<PWAUpdateModalProps> = ({
    isOpen,
    onUpdate,
    onDismiss,
    version,
    confirmLoading = false,
    confirmText = 'Update Now',
    cancelText = 'Later'
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

    const isDisabled = confirmLoading

    // Use success color for update button
    const colorStyle = {
        borderColor: 'rgba(104,255,174,0.3)',
        color: '#68ffae',
        hoverBg: 'rgba(104,255,174,0.15)',
        hoverBorder: '#68ffae',
        hoverShadow: 'rgba(104, 255, 174, 0.3)'
    }

    const overlayAnimation = isAnimatingOut ? 'confirmOverlayOut 0.15s ease-in forwards' : 'confirmOverlayIn 0.15s ease-out'
    const modalAnimation = isAnimatingOut ? 'confirmModalOut 0.15s ease-in forwards' : 'confirmModalIn 0.15s ease-out'

    const title = 'Update Available'
    const message = version 
        ? `Version ${version} is available. Update now to get the latest features and fixes.`
        : 'A new version of Trackist is available. Update now to get the latest features and fixes.'

    return (
        <div 
            className="confirm-modal-overlay" 
            onClick={confirmLoading ? undefined : onDismiss}
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
                        onClick={onDismiss}
                        className="confirm-modal-btn confirm-modal-btn--cancel"
                        disabled={isDisabled}
                        style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onUpdate}
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

export default PWAUpdateModal