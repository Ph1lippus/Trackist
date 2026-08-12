import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import { fixAllProgress } from '../../services/watchlistService'
import type { FixProgress } from '../../services/watchlistService'

interface ProgressFixModalProps {
    isOpen: boolean
    onClose: () => void
    onComplete?: () => void
}

type ModalView = 'confirm' | 'running' | 'summary'

const ProgressFixModal: React.FC<ProgressFixModalProps> = ({ isOpen, onClose, onComplete }) => {
    const [view, setView] = useState<ModalView>('confirm')
    const [progress, setProgress] = useState<FixProgress | null>(null)
    const [isRunning, setIsRunning] = useState(false)

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setTimeout(() => {
                setView('confirm')
                setProgress(null)
                setIsRunning(false)
            }, 200)
        }
    }, [isOpen])

    const handleRunFix = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setIsRunning(true)
        setView('running')

        const result = await fixAllProgress(user.id, (p) => {
            setProgress({ ...p })
        })

        setProgress(result)
        setView('summary')
        setIsRunning(false)
    }, [])

    const handleClose = () => {
        if (view === 'summary' && onComplete) {
            onComplete()
        }
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="progress-fix-modal-overlay" onClick={view !== 'running' ? handleClose : undefined}>
            <div className="progress-fix-modal-content" onClick={(e) => e.stopPropagation()}>
                {view === 'confirm' && (
                    <>
                        <div className="progress-fix-modal-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        </div>
                        <h3 className="progress-fix-modal-title">Fix Progress</h3>
                        <p className="progress-fix-modal-message">
                            This will scan your watchlist and fix status and season tracking issues for both TV shows and movies.
                            This may take a few moments. The operation cannot be undone once started.
                        </p>
                        <p className="progress-fix-modal-submessage">
                            <strong>For TV Shows & Anime:</strong>
                            <br />
                            • Shows with <strong>incorrect current season</strong> will be recalculated from watched episodes.
                            <br />
                            • Shows with <strong>no episodes watched</strong> will be set to "Planning" status.
                            <br />
                            • Shows with <strong>missing episode data</strong> will be recalculated from TMDB.
                            <br />
                            • Shows with <strong>all episodes watched</strong> will be marked as completed or caught up.
                            <br />
                            • Episodes with <strong>missing TMDB episode ID</strong> will be backfilled.
                            <br />
                            <strong>For Movies:</strong>
                            <br />
                            • Movies with <strong>status="watching"</strong> will be changed to "Planning" (movies should only be planning or completed).
                        </p>
                        <div className="progress-fix-modal-actions">
                            <button
                                onClick={handleClose}
                                className="progress-fix-modal-btn progress-fix-modal-btn--cancel"
                                disabled={isRunning}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRunFix}
                                className="progress-fix-modal-btn progress-fix-modal-btn--confirm"
                                disabled={isRunning}
                            >
                                Start Fix
                            </button>
                        </div>
                    </>
                )}

                {view === 'running' && (
                    <>
                        <div className="progress-fix-modal-spinner">
                            <div className="progress-fix-spinner" />
                        </div>
                        <h3 className="progress-fix-modal-title">Fixing Progress...</h3>
                        {progress && (
                            <div className="progress-fix-modal-progress">
                                <div className="progress-fix-modal-stats">
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Scanned</span>
                                        <span className="progress-fix-stat-value">{progress.total}</span>
                                    </div>
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Processed</span>
                                        <span className="progress-fix-stat-value">{progress.processed}</span>
                                    </div>
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Fixed</span>
                                        <span className="progress-fix-stat-value progress-fix-stat-value--success">{progress.fixed}</span>
                                    </div>
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Errors</span>
                                        <span className="progress-fix-stat-value progress-fix-stat-value--error">{progress.errors}</span>
                                    </div>
                                </div>
                                {progress.currentShow && (
                                    <div className="progress-fix-modal-current">
                                        <span className="progress-fix-current-label">Currently processing:</span>
                                        <span className="progress-fix-current-show">{progress.currentShow}</span>
                                    </div>
                                )}
                                {progress.total > 0 && (
                                    <div className="progress-fix-modal-bar-wrap">
                                        <div
                                            className="progress-fix-modal-bar"
                                            style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {view === 'summary' && (
                    <>
                        <div className="progress-fix-modal-icon">
                            {progress && progress.errors === 0 ? (
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#68ffae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            ) : (
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            )}
                        </div>
                        <h3 className="progress-fix-modal-title">Fix Complete</h3>
                        {progress && (
                            <div className="progress-fix-modal-summary">
                                <div className="progress-fix-modal-stats">
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Items Found</span>
                                        <span className="progress-fix-stat-value">{progress.total}</span>
                                    </div>
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Fixed</span>
                                        <span className="progress-fix-stat-value progress-fix-stat-value--success">{progress.fixed}</span>
                                    </div>
                                    <div className="progress-fix-stat">
                                        <span className="progress-fix-stat-label">Errors</span>
                                        <span className="progress-fix-stat-value progress-fix-stat-value--error">{progress.errors}</span>
                                    </div>
                                </div>
                                {progress.errorDetails.length > 0 && (
                                    <div className="progress-fix-modal-errors">
                                        <p className="progress-fix-errors-title">Error Details:</p>
                                        <ul className="progress-fix-errors-list">
                                            {progress.errorDetails.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="progress-fix-modal-actions">
                            <button
                                onClick={handleClose}
                                className="progress-fix-modal-btn progress-fix-modal-btn--confirm"
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ProgressFixModal