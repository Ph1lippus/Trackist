import React, { useState, useEffect } from 'react'
import { useMFA } from '../../hooks/useMFA'

interface MFAChallengeProps {
    factorId: string
    onSuccess: () => void
    onBack?: () => void
    rememberDevice?: boolean
    onRememberDeviceChange?: (value: boolean) => void
}

const MFAChallenge: React.FC<MFAChallengeProps> = ({ 
    factorId, 
    onSuccess, 
    onBack,
    rememberDevice = false,
    onRememberDeviceChange
}) => {
    const { challenge, verify, error, clearError } = useMFA()
    const [code, setCode] = useState('')
    const [challengeId, setChallengeId] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)
    const [useBackupCode, setUseBackupCode] = useState(false)
    const [backupCode, setBackupCode] = useState('')

    useEffect(() => {
        const createChallenge = async () => {
            clearError()
            try {
                const data = await challenge(factorId)
                if (data) {
                    setChallengeId(data.id)
                }
            } catch {
            }
        }
        createChallenge()
    }, [challenge, factorId, clearError])

    const handleVerify = async () => {
        if (!challengeId) return
        
        const codeToVerify = useBackupCode ? backupCode : code
        if (!codeToVerify) return
        
        setVerifying(true)
        try {
            const result = await verify(factorId, challengeId, codeToVerify)
            if (result) {
                onSuccess()
            }
        } catch {
        } finally {
            setVerifying(false)
        }
    }

    const handleResendChallenge = async () => {
        setCode('')
        setBackupCode('')
        clearError()
        try {
            const data = await challenge(factorId)
            if (data) {
                setChallengeId(data.id)
            }
        } catch {
        }
    }

    return (
        <div className="mfa-challenge">
            <h3>Two-Factor Authentication</h3>
            <p className="mfa-instruction">
                Enter the 6-digit code from your authenticator app to continue.
            </p>

            {!useBackupCode ? (
                <div className="mfa-code-input">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        autoFocus
                    />
                </div>
            ) : (
                <div className="mfa-code-input">
                    <input
                        type="text"
                        value={backupCode}
                        onChange={(e) => setBackupCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                        placeholder="BACKUP CODE"
                        maxLength={8}
                        autoComplete="one-time-code"
                        autoFocus
                    />
                </div>
            )}

            {error && <div className="mfa-error">{error}</div>}

            <div className="mfa-actions">
                <button 
                    className="mfa-btn mfa-btn--primary"
                    onClick={handleVerify}
                    disabled={verifying || !challengeId || (useBackupCode ? !backupCode : code.length !== 6)}
                >
                    {verifying ? 'Verifying...' : 'Verify'}
                </button>
                
                {onBack && (
                    <button 
                        className="mfa-btn mfa-btn--secondary"
                        onClick={onBack}
                    >
                        Back
                    </button>
                )}
            </div>

            <div className="mfa-options">
                <label className="mfa-remember-device">
                    <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => onRememberDeviceChange?.(e.target.checked)}
                    />
                    Remember this device for 30 days
                </label>

                <button
                    type="button"
                    className="mfa-link"
                    onClick={() => setUseBackupCode(!useBackupCode)}
                >
                    {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code'}
                </button>
            </div>

            <button
                type="button"
                className="mfa-link mfa-resend"
                onClick={handleResendChallenge}
                disabled={verifying}
            >
                Didn't receive a code? Resend challenge
            </button>
        </div>
    )
}

export default MFAChallenge