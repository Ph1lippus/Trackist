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
    const [enrolling, setEnrolling] = useState(true)
    const [enrollFailed, setEnrollFailed] = useState(false)
    const [alreadyEnabled, setAlreadyEnabled] = useState(false)
    const [backupError, setBackupError] = useState<string | null>(null)
    const [backupLoading, setBackupLoading] = useState(false)

    const removeStaleFactors = async (): Promise<boolean> => {
        try {
            const existing = await mfaService.listFactors()
            let hasVerifiedTOTP = false
            for (const factor of existing) {
                if (factor.factorType === 'totp' && factor.status === 'unverified') {
                    await mfaService.unenroll(factor.id)
                } else if (factor.factorType === 'totp' && factor.status === 'verified') {
                    hasVerifiedTOTP = true
                }
            }
            return hasVerifiedTOTP
        } catch {
            return false
        }
    }

    const startEnroll = async () => {
        clearError()
        setEnrolling(true)
        setEnrollFailed(false)
        setAlreadyEnabled(false)
        try {
            const hasVerifiedTOTP = await removeStaleFactors()
            if (hasVerifiedTOTP) {
                setEnrolling(false)
                setAlreadyEnabled(true)
                return
            }
            const data = await enroll('totp', 'Trackist Authenticator')
            if (data?.totp) {
                setEnrollData({
                    qrCode: data.totp.qrCode,
                    secret: data.totp.secret,
                    uri: data.totp.uri,
                    factorId: data.id
                })
                setStep('verify')
            } else {
                setEnrolling(false)
                setEnrollFailed(true)
            }
        } catch {
            setEnrolling(false)
            setEnrollFailed(true)
        }
    }

    useEffect(() => {
        startEnroll()
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
        setBackupError(null)
        setBackupLoading(true)
        try {
            const codes = await mfaService.generateBackupCodes()
            if (codes.length > 0) {
                setBackupCodes(codes.map(c => c.code))
                setShowBackupCodes(true)
            } else {
                setBackupError('The server returned no backup codes. Make sure the mfa-backup-codes edge function is deployed and the user_mfa_backup_codes table exists.')
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            setBackupError(`Failed to generate backup codes: ${message}`)
        } finally {
            setBackupLoading(false)
        }
    }

    const handleContinue = () => {
        onSuccess?.()
        onClose?.()
    }

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
        }
    }

    const downloadBackupCodes = () => {
        const header = 'Trackist - Backup Codes\n========================\nEach code can be used once.\n\n'
        const body = backupCodes.join('\n')
        const blob = new Blob([header + body + '\n'], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'trackist-backup-codes.txt'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const qrUriWithIcon = enrollData
        ? enrollData.uri.includes('?')
            ? `${enrollData.uri}&image=${encodeURIComponent(`${window.location.origin}/TRACK1ST-FULLNAMELGO.png`)}`
            : `${enrollData.uri}?image=${encodeURIComponent(`${window.location.origin}/TRACK1ST-FULLNAMELGO.png`)}`
        : ''

    if (step === 'enroll') {
        return (
            <div className="mfa-setup">
                <div className="mfa-step">
                    {enrolling && !enrollFailed && !alreadyEnabled ? (
                        <>
                            <div className="spinner"></div>
                            <p>Setting up 2FA...</p>
                        </>
                    ) : alreadyEnabled ? (
                        <>
                            <i className="fa-solid fa-shield-check mfa-step-error-icon mfa-step-success-icon"></i>
                            <p className="mfa-step-error">
                                Two-factor authentication is already enabled on this account.
                            </p>
                            <p className="mfa-instruction">
                                To set it up again, first remove the existing method from the
                                Two-Factor Authentication page, then come back to enable it.
                            </p>
                            <div className="mfa-actions">
                                <button
                                    className="mfa-btn mfa-btn--primary"
                                    onClick={onClose}
                                >
                                    Go to 2FA settings
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <i className="fa-solid fa-circle-exclamation mfa-step-error-icon"></i>
                            <p className="mfa-step-error">
                                {error || 'We could not start two-factor authentication setup. Please try again.'}
                            </p>
                            <div className="mfa-actions">
                                <button
                                    className="mfa-btn mfa-btn--primary"
                                    onClick={startEnroll}
                                    disabled={enrolling}
                                >
                                    {enrolling ? 'Retrying...' : 'Retry Setup'}
                                </button>
                                <button
                                    className="mfa-btn mfa-btn--secondary"
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
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
                            value={qrUriWithIcon} 
                            size={200}
                            level="M"
                            includeMargin={true}
                        />
                        <p className="mfa-secret">
                            Secret: <code>{enrollData.secret}</code>
                            <button 
                                type="button"
                                className="copy-btn"
                                onClick={() => copyText(enrollData.secret)}
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
                    {backupCodes.length === 0 ? (
                        <div className="mfa-backup-empty">
                            {backupLoading ? (
                                <div className="mfa-step">
                                    <div className="spinner"></div>
                                    <p>Generating backup codes...</p>
                                </div>
                            ) : (
                                <>
                                    {backupError && <p className="mfa-step-error">{backupError}</p>}
                                    <p className="mfa-instruction">
                                        No backup codes are available. You can retry generating them.
                                    </p>
                                    <button
                                        className="mfa-btn mfa-btn--primary"
                                        onClick={generateBackupCodes}
                                    >
                                        Retry Generating Codes
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        backupCodes.map((code, index) => (
                            <div key={index} className="backup-code">
                                <span>{code}</span>
                                <button 
                                    type="button"
                                    className="copy-btn"
                                    onClick={() => copyText(code)}
                                >
                                    Copy
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="mfa-backup-actions">
                    <button 
                        className="mfa-btn mfa-btn--primary"
                        onClick={() => {
                            copyText(backupCodes.join('\n'))
                            alert('All codes copied to clipboard')
                        }}
                        disabled={backupCodes.length === 0}
                    >
                        Copy All Codes
                    </button>
                    <button 
                        className="mfa-btn mfa-btn--download"
                        onClick={downloadBackupCodes}
                        disabled={backupCodes.length === 0}
                    >
                        <i className="fa-solid fa-download"></i> Download Codes
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