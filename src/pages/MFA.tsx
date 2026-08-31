import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, ShieldPlus, Fingerprint, QrCode, Trash2, CircleAlert } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import { useMFA } from '../hooks/useMFA'
import MFASetup from '../components/auth/MFASetup'
import MFAChallenge from '../components/auth/MFAChallenge'
import { usePageTitle } from '../hooks/usePageTitle'

const MFA: React.FC = () => {
    usePageTitle('Track1st - Two-Factor Authentication')
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useAuthStore()
    const { listFactors, unenroll, factors, loading: mfaLoading, error: mfaError } = useMFA()
    const [view, setView] = useState<'list' | 'setup' | 'challenge'>('list')
    const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null)
    const [rememberDevice, setRememberDevice] = useState(false)

    useEffect(() => {
        if (!user) {
            navigate('/login')
            return
        }
        loadFactors()
    }, [user, navigate])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const challenge = params.get('challenge')
        if (challenge) {
            setView('challenge')
            setSelectedFactorId(challenge)
        }
    }, [location.search])

    const loadFactors = async () => {
        try {
            await listFactors()
        } catch {
        }
    }

    const handleSetupSuccess = () => {
        setView('list')
        loadFactors()
    }

    const handleChallengeSuccess = () => {
        // MFA verified successfully, update session if needed
        setView('list')
        navigate('/', { replace: true })
    }

    const handleRemoveFactor = async (factorId: string) => {
        if (!confirm('Are you sure you want to remove this 2FA method?')) return
        
        try {
            await unenroll(factorId)
            loadFactors()
        } catch {
        }
    }

    if (!user) return null

    const hasVerifiedFactor = factors.some(f => f.status === 'verified')

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage mfa-page">
                    <div className="settings-panel__header">
                        <div className="settings-panel__title-row">
                            <span className="settings-panel__title-icon"><ShieldCheck size={18} strokeWidth={2.2} /></span>
                            <h3>Two-Factor Authentication</h3>
                        </div>
                        <p>Protect your account with an extra verification step.</p>
                    </div>

                    {mfaError && (
                        <span className="settings-inline-feedback settings-inline-feedback--error">
                            <CircleAlert size={13} strokeWidth={2.2} />
                            {mfaError}
                        </span>
                    )}

                    {view === 'setup' && (
                        <MFASetup onSuccess={handleSetupSuccess} onClose={() => setView('list')} />
                    )}

                    {view === 'challenge' && selectedFactorId && (
                        <MFAChallenge
                            factorId={selectedFactorId}
                            onSuccess={handleChallengeSuccess}
                            onBack={() => { setView('list'); navigate('/Settings') }}
                            rememberDevice={rememberDevice}
                            onRememberDeviceChange={setRememberDevice}
                        />
                    )}

                    {view === 'list' && (
                        <>
                            <div className="mfa-status">
                                <div className={`mfa-status-indicator ${hasVerifiedFactor ? 'enabled' : 'disabled'}`}>
                                    {hasVerifiedFactor ? <ShieldCheck size={16} strokeWidth={2.2} /> : <ShieldAlert size={16} strokeWidth={2.2} />}
                                    <span>{hasVerifiedFactor ? '2FA enabled' : '2FA disabled'}</span>
                                </div>
                                <p className="mfa-status-text">
                                    {hasVerifiedFactor
                                        ? 'Your account is protected with two-factor authentication.'
                                        : 'Enable 2FA to add an extra layer of security to your account.'}
                                </p>
                            </div>

                            {!hasVerifiedFactor && (
                                <button
                                    className="settings-btn settings-btn--primary mfa-enable-btn"
                                    onClick={() => setView('setup')}
                                    disabled={mfaLoading}
                                >
                                    <ShieldPlus size={16} strokeWidth={2.2} />
                                    Enable Two-Factor Authentication
                                </button>
                            )}

                            {hasVerifiedFactor && factors.length > 0 && (
                                <div className="mfa-factors">
                                    <h3>Your 2FA methods</h3>
                                    <ul>
                                        {factors.map(factor => (
                                            <li key={factor.id} className={`mfa-factor ${factor.status}`}>
                                                <div className="mfa-factor-info">
                                                    {factor.factorType === 'totp' ? <QrCode size={18} strokeWidth={2.2} /> : <Fingerprint size={18} strokeWidth={2.2} />}
                                                    <div>
                                                        <strong>{factor.friendlyName}</strong>
                                                        <span className="mfa-factor-type">
                                                            {factor.factorType.toUpperCase()} • {factor.status === 'verified' ? 'Verified' : 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {factor.status === 'verified' && (
                                                    <button
                                                        className="settings-btn settings-btn--secondary"
                                                        onClick={() => handleRemoveFactor(factor.id)}
                                                        disabled={mfaLoading}
                                                    >
                                                        <Trash2 size={16} strokeWidth={2.2} /> Remove
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="mfa-info">
                                <h4>About Two-Factor Authentication</h4>
                                <ul>
                                    <li>Adds an extra layer of security beyond your password.</li>
                                    <li>Uses time-based one-time passwords from your authenticator app.</li>
                                    <li>Backup codes are provided for account recovery if you lose access.</li>
                                    <li>Works with apps like Google Authenticator, Authy, 1Password, and Bitwarden.</li>
                                </ul>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    )
}

export default MFA