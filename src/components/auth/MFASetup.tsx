import React, { useState, useEffect } from 'react'
import { useMFA } from '../../hooks/useMFA'
import { QRCodeSVG } from 'qrcode.react'
import mfaService from '../../services/mfaService'

interface MFASetupProps {
    onSuccess?: () => void
    onClose?: () => void
}

const MFASetup: React.FC<MFASetupProps> = ({ onSuccess, onClose }) => {
    const { enroll, error, clearError } = useMFA()
    const [step, setStep] = useState<'enroll' | 'verify' | 'backup'>('enroll')
    const [enrollData, setEnrollData] = useState<{ qrCode: string; secret: string; uri: string; factorId: string } | null>(null)
    const [challengeId, setChallengeId] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [showBackupCodes, setShowBackupCodes] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [creatingChallenge, setCreatingChallenge] = useState(false)

    useEffect(() => {
        const setup = async () => {
            clearError()
            try {
                const data = await enroll('totp', 'Trackist Authenticator')
                if (data?.totp) {
                    setEnrollData({
                        qrCode: data.totp.qrCode,
                        secret: data.totp.secret,
                        uri: data.totp.uri,
                        factorId: data.id
                    })
                    setStep('verify')
                }
            } catch {
            }
        }
        setup()
    }, [enroll, clearError])

    const handleCreateChallenge = async () => {
        if (!enrollData) return
        
        setCreatingChallenge(true)
        try {
            const data = await mfaService.challenge(enrollData.factorId)
            if (data) {
                setChallengeId(data.id)
            }
        } catch {
        } finally {
            setCreatingChallenge(false)
        }
    }

    useEffect(() => {
        if (step === 'verify' && enrollData && !challengeId) {
            handleCreateChallenge()
        }
    }, [step, enrollData, challengeId])

    const handleVerify = async () => {
        if (!challengeId || code.length !== 6) return
        
        setVerifying(true)
        try {
            const result = await mfaService.verify(enrollData?.factorId || '', challengeId, code)
            if (result) {
                setStep('backup')
                await generateBackupCodes()
            }
        } catch {
        } finally {
            setVerifying(false)
        }
    }

    const generateBackupCodes = async () => {
        try {
            const codes = await mfaService.generateBackupCodes()
            setBackupCodes(codes.map(c => c.code))
            setShowBackupCodes(true)
        } catch {
        }
    }

    const handleContinue = () => {
        onSuccess?.()
        onClose?.()
    }

    if (step === 'enroll') {
        return (
            <div className="mfa-setup">
                <div className="mfa-step">
                    <div className="spinner"></div>
                    <p>Setting up 2FA...</p>
                </div>
            </div>
        )
    }

    if (step === 'verify') {
        return (
            <div className="mfa-setup">
                <h3>Scan QR Code</h3>
                <p className="mfa-instruction">
                    Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) 
                    and scan the QR code below.
                </p>
                
                {enrollData && (
                    <div className="mfa-qr-container">
                        <QRCodeSVG 
                            value={enrollData.uri} 
                            size={200}
                            level="M"
                            includeMargin={true}
                        />
                        <p className="mfa-secret">
                            Secret: <code>{enrollData.secret}</code>
                            <button 
                                type="button"
                                className="copy-btn"
                                onClick={() => navigator.clipboard.writeText(enrollData.secret)}
                            >
                                Copy
                            </button>
                        </p>
                    </div>
                )}

                <p className="mfa-instruction">
                    Enter the 6-digit code from your authenticator app:
                </p>

                <div className="mfa-code-input">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                    />
                </div>

                {error && <div className="mfa-error">{error}</div>}

                <div className="mfa-actions">
                    <button 
                        className="mfa-btn mfa-btn--primary"
                        onClick={handleVerify}
                        disabled={verifying || code.length !== 6 || creatingChallenge}
                    >
                        {verifying ? 'Verifying...' : creatingChallenge ? 'Preparing...' : 'Verify & Continue'}
                    </button>
                    <button 
                        className="mfa-btn mfa-btn--secondary"
                        onClick={() => { setStep('enroll'); setCode(''); }}
                    >
                        Rescan QR
                    </button>
                </div>

                <details className="mfa-manual-entry">
                    <summary>Can't scan the QR code?</summary>
                    <p>Enter this secret key manually in your authenticator app:</p>
                    <code>{enrollData?.secret}</code>
                </details>
            </div>
        )
    }

    if (step === 'backup') {
        return (
            <div className="mfa-setup">
                <h3>Backup Codes</h3>
                <p className="mfa-instruction">
                    Save these backup codes in a safe place. Each code can be used once 
                    if you lose access to your authenticator app.
                </p>

                <div className="mfa-backup-codes">
                    {backupCodes.map((code, index) => (
                        <div key={index} className="backup-code">
                            <span>{code}</span>
                            <button 
                                type="button"
                                className="copy-btn"
                                onClick={() => navigator.clipboard.writeText(code)}
                            >
                                Copy
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mfa-backup-actions">
                    <button 
                        className="mfa-btn mfa-btn--primary"
                        onClick={() => {
                            navigator.clipboard.writeText(backupCodes.join('\n'))
                            alert('All codes copied to clipboard')
                        }}
                    >
                        Copy All Codes
                    </button>
                    <button 
                        className="mfa-btn mfa-btn--secondary"
                        onClick={() => window.print()}
                    >
                        Print Codes
                    </button>
                </div>

                <label className="mfa-confirm">
                    <input 
                        type="checkbox" 
                        required
                        onChange={(e) => setShowBackupCodes(e.target.checked)}
                    />
                    I have saved my backup codes in a secure location
                </label>

                <button 
                    className="mfa-btn mfa-btn--primary"
                    onClick={handleContinue}
                    disabled={!showBackupCodes}
                >
                    Done
                </button>
            </div>
        )
    }

    return null
}

export default MFASetup