import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { useMFA } from '../hooks/useMFA'
import MFASetup from '../components/auth/MFASetup'
import MFAChallenge from '../components/auth/MFAChallenge'
import { usePageTitle } from '../hooks/usePageTitle'

const MFA: React.FC = () => {
    usePageTitle('Trackist - Two-Factor Authentication')
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
            <div className="auth-layout">
                <div className="auth-form-wrapper">
                    <div className="auth-card mfa-page">
                        <h2 className="auth-title">Two-Factor Authentication</h2>
                        
                        {mfaError && <div className="auth-alert auth-alert--error">{mfaError}</div>}

                        {view === 'setup' && (
                            <MFASetup onSuccess={handleSetupSuccess} onClose={() => setView('list')} />
                        )}

                        {view === 'challenge' && selectedFactorId && (
                            <MFAChallenge
                                factorId={selectedFactorId}
                                onSuccess={handleChallengeSuccess}
                                onBack={() => { setView('list'); navigate('/settings') }}
                                rememberDevice={rememberDevice}
                                onRememberDeviceChange={setRememberDevice}
                            />
                        )}

                        {view === 'list' && (
                            <>
                                <div className="mfa-status">
                                    <div className={`mfa-status-indicator ${hasVerifiedFactor ? 'enabled' : 'disabled'}`}>
                                        <i className={`fa-solid ${hasVerifiedFactor ? 'fa-shield-check' : 'fa-shield-exclamation'}`}></i>
                                        <span>{hasVerifiedFactor ? '2FA Enabled' : '2FA Disabled'}</span>
                                    </div>
                                    <p className="mfa-status-text">
                                        {hasVerifiedFactor 
                                            ? 'Your account is protected with two-factor authentication.' 
                                            : 'Enable 2FA to add an extra layer of security to your account.'}
                                    </p>
                                </div>

                                {!hasVerifiedFactor && (
                                    <button 
                                        className="auth-submit-btn mfa-enable-btn"
                                        onClick={() => setView('setup')}
                                        disabled={mfaLoading}
                                    >
                                        <i className="fa-solid fa-shield-plus"></i>
                                        Enable Two-Factor Authentication
                                    </button>
                                )}

                                {hasVerifiedFactor && factors.length > 0 && (
                                    <div className="mfa-factors">
                                        <h3>Your 2FA Methods</h3>
                                        <ul>
                                            {factors.map(factor => (
                                                <li key={factor.id} className={`mfa-factor ${factor.status}`}>
                                                    <div className="mfa-factor-info">
                                                        <i className={`fa-solid ${factor.factorType === 'totp' ? 'fa-qrcode' : 'fa-fingerprint'}`}></i>
                                                        <div>
                                                            <strong>{factor.friendlyName}</strong>
                                                            <span className="mfa-factor-type">
                                                                {factor.factorType.toUpperCase()} • {factor.status === 'verified' ? 'Verified' : 'Pending'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {factor.status === 'verified' && (
                                                        <button
                                                            className="mfa-btn mfa-btn--danger"
                                                            onClick={() => handleRemoveFactor(factor.id)}
                                                            disabled={mfaLoading}
                                                        >
                                                            Remove
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
                                        <li>Adds an extra layer of security beyond your password</li>
                                        <li>Uses time-based one-time passwords (TOTP) from authenticator apps</li>
                                        <li>Backup codes provided for account recovery</li>
                                        <li>Compatible with Google Authenticator, Authy, 1Password, Bitwarden, etc.</li>
                                    </ul>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}

export default MFA