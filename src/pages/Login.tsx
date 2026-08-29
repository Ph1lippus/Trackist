import React, { useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmail } from '../services/profileService'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuthRateLimit } from '../hooks/useAuthRateLimit'
import { useCaptcha, isCaptchaEnabled } from '../hooks/useCaptcha'
import Captcha from '../components/auth/Captcha'
import type { CaptchaHandle } from '../components/auth/Captcha'

const Login: React.FC = () => {
    usePageTitle('Track1st - Login')
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    
    const { allowed, recordAttempt, retryAfterFormatted, isChecking } = useAuthRateLimit('login')
    const rateLimited = !allowed && !isChecking
    const { verifyCaptcha, captchaError, verifying } = useCaptcha()
    const [captchaToken, setCaptchaToken] = useState<string | null>(null)
    const captchaRef = useRef<CaptchaHandle>(null)
    const pendingSubmitRef = useRef(false)

    const performLogin = useCallback(async (token?: string) => {
        if (loading) return
        setError('')
        setMessage('')
        setLoading(true)

        if (isCaptchaEnabled() && token) {
            const captchaValid = await verifyCaptcha(token)
            if (!captchaValid) {
                setCaptchaToken(null) // Reset token to force new challenge
                setLoading(false)
                pendingSubmitRef.current = false
                return
            }
        }

        // Small random delay for constant-time response (50-150ms)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))

        const { data, error: signInError } = await signInWithEmail(email.trim().toLowerCase(), password)

        setLoading(false)
        pendingSubmitRef.current = false

        // A user with 2FA enabled returns no session yet — instead we get an
        // MFA-required signal and the list of factors to verify. Route them to
        // the challenge screen (which verifies the TOTP code and completes login).
        const mfaRequired = !!data && (
            (data as { factors?: unknown[] }).factors ||
            ['mfa_verification_required', 'mfa_enrollment_required'].includes(signInError?.code || '')
        )

        if (mfaRequired) {
            const factors = (data as { factors?: Array<{ id?: string }> }).factors
            const factorId = factors?.[0]?.id
            if (factorId) {
                navigate(`/MFA?challenge=${encodeURIComponent(factorId)}`)
                return
            }
            // No factor id resolvable — fall through to error.
        }

        if (signInError) {
            recordAttempt()
            setCaptchaToken(null) // Reset captcha on failure
            setError('Invalid email or password')
            return
        }

        if (data?.session) {
            navigate('/')
        }
    }, [email, password, loading, verifyCaptcha, recordAttempt, navigate])

    const handleCaptchaVerify = useCallback((token: string) => {
        setCaptchaToken(token)
        if (pendingSubmitRef.current && token !== '__captcha_disabled__') {
            pendingSubmitRef.current = false
            void performLogin(token)
        }
    }, [performLogin])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (rateLimited) {
            setError(`Too many attempts. Please try again in ${retryAfterFormatted}.`)
            return
        }
        
        // Verify captcha first (skipped when captcha is disabled, e.g. local dev)
        if (isCaptchaEnabled()) {
            if (!captchaToken) {
                pendingSubmitRef.current = true
                captchaRef.current?.execute()
                return
            }

            await performLogin(captchaToken)
            return
        }

        await performLogin()
    }

    return (
        <main className="main">
            <div className="auth-layout">
                <div className="auth-form-wrapper">
                    <div className="auth-card">
                        <h2 className="auth-title">Welcome Back</h2>
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="auth-field">
                                <label htmlFor="email" className="auth-label">Email</label>
                                <input
                                    type="email"
                                    className="auth-input"
                                    id="email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="password" className="auth-label">Password</label>
                                <div className="password-input-wrap">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="auth-input"
                                        id="password"
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>
                            {error && <div className="auth-alert auth-alert--error">{error}</div>}
                            {message && <div className="auth-alert auth-alert--info">{message}</div>}
                            {rateLimited && (
                                <div className="auth-alert auth-alert--error rate-limit-message">
                                    <i className="fa-solid fa-clock"></i>
                                    Too many login attempts. Please try again in {retryAfterFormatted}.
                                </div>
                            )}
                            {captchaError && (
                                <div className="auth-alert auth-alert--error">{captchaError}</div>
                            )}
                            <Captcha ref={captchaRef} onVerify={handleCaptchaVerify} onError={(err: string) => setError(err)} action="login" autoExecute={isCaptchaEnabled()} />
                            <button type="submit" className="auth-submit-btn" disabled={loading || rateLimited || verifying}>
                                {loading || verifying ? 'Logging in...' : 'Login'}
                            </button>
                        </form>
                        <div className="auth-extra-links">
                            <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
                        </div>
                        <p className="auth-text">
                            Don't have an account? <Link to="/register" className="auth-link">Register</Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Login
