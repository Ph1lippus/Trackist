import React, { useMemo, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

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
    customContent?: ReactNode
}

const ConfirmModal = React.memo<ConfirmModalProps>(({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmColor = 'primary',
    disabled = false,
    confirmLoading = false,
    customContent
}) => {
    const colorStyle = useMemo(() => {
        switch (confirmColor) {
            case 'success':
                return {
                    borderColor: 'rgba(104,255,174,0.3)',
                    color: '#68ffae',
                    hoverBg: 'rgba(104,255,174,0.15)'
                }
            case 'danger':
                return {
                    borderColor: 'rgba(255,107,107,0.3)',
                    color: '#ff6b6b',
                    hoverBg: 'rgba(255,107,107,0.15)'
                }
            default:
                return {
                    borderColor: 'rgba(133,138,227,0.3)',
                    color: 'var(--color-primary)',
                    hoverBg: 'rgba(133,138,227,0.15)'
                }
        }
    }, [confirmColor])

    const [visible, setVisible] = useState(false)
    const [isEntering, setIsEntering] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setVisible(true)
            setIsEntering(true)
        } else if (visible) {
            setIsEntering(false)
            const timer = setTimeout(() => setVisible(false), 100)
            return () => clearTimeout(timer)
        }
    }, [isOpen, visible])

    if (!visible) return null

    const isDisabled = disabled || confirmLoading

    const handleCancel = () => {
        if (!isEntering) return
        onCancel()
    }

    const handleConfirm = () => {
        if (!isEntering) return
        onConfirm()
    }

    return (
        <div
            className={`confirm-modal-overlay ${isEntering ? 'confirm-modal-overlay--enter' : 'confirm-modal-overlay--leave'}`}
            onClick={isEntering ? (confirmLoading ? undefined : handleCancel) : undefined}
        >
            <div
                className={`confirm-modal-content ${isEntering ? 'confirm-modal-content--enter' : 'confirm-modal-content--leave'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="confirm-modal-title">{title}</h3>
                <p className="confirm-modal-message">{message}</p>
                {customContent && (
                    <div className="confirm-modal-custom-content">
                        {customContent}
                    </div>
                )}
                {!customContent && (
                    <div className="confirm-modal-actions">
                        <button
                            onClick={handleCancel}
                            className="confirm-modal-btn confirm-modal-btn--cancel"
                            disabled={isDisabled}
                            style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
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
                )}
            </div>
        </div>
    )
})

export default ConfirmModal