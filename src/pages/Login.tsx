import React, { useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmail, signInWithGoogle } from '../services/profileService'
import { supabase } from '../services/supabaseClient'
import mfaService from '../services/mfaService'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuthRateLimit } from '../hooks/useAuthRateLimit'
import { useCaptcha, isCaptchaEnabled } from '../hooks/useCaptcha'
import Captcha from '../components/auth/Captcha'
import type { CaptchaHandle } from '../components/auth/Captcha'
import GoogleIcon from '../components/auth/GoogleIcon'

const Login: React.FC = () => {
    usePageTitle('Track1st - Login')
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState(() => {
        const authError = new URLSearchParams(window.location.search).get('error_description')
        return authError ? authError.replace(/\+/g, ' ') : ''
    })
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

        if (signInError) {
            recordAttempt()
            setCaptchaToken(null) // Reset captcha on failure
            if (signInError.code === 'email_not_confirmed') {
                setError('Please confirm your email address before signing in.')
            } else if (signInError.code === 'invalid_credentials' || signInError.status === 400) {
                setError('The email or password is incorrect.')
            } else {
                console.error('Supabase sign-in error:', signInError)
                setError('Unable to sign in right now. Please try again.')
            }
            return
        }

        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (assuranceError) {
            console.error('Unable to determine authentication assurance level:', assuranceError)
            await supabase.auth.signOut()
            setError('Unable to complete sign in. Please try again.')
            return
        }

        if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
            try {
                const factors = await mfaService.listFactors()
                const factor = factors.find(candidate => candidate.status === 'verified')
                if (!factor) {
                    await supabase.auth.signOut()
                    setError('Two-factor authentication is enabled but no verified method is available.')
                    return
                }
                navigate(`/MFA?challenge=${encodeURIComponent(factor.id)}`)
                return
            } catch (error) {
                console.error('Unable to start two-factor authentication:', error)
                await supabase.auth.signOut()
                setError('Unable to start two-factor authentication. Please try again.')
                return
            }
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

    const handleGoogleLogin = async () => {
        setError('')
        setLoading(true)
        const { error: googleError } = await signInWithGoogle()
        if (googleError) {
            setLoading(false)
            setError(googleError.message)
        }
    }

    return (
        <main className="main">
            <div className="auth-layout">
                <section className="auth-hero" aria-labelledby="auth-hero-title">
                    <span className="auth-hero__eyebrow">YOUR WATCHLIST, ELEVATED</span>
                    <h1 id="auth-hero-title">Keep every story worth watching close.</h1>
                    <p>Track the movies and shows you love, discover what is next, and never lose your place again.</p>
                    <div className="auth-hero__highlights">
                        <span>Movies and TV shows</span>
                        <span>Release reminders</span>
                        <span>Private by design</span>
                    </div>
                </section>
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
                            {(error || rateLimited || captchaError) && (
                                <div className="auth-alert-stack" role="region" aria-label="Sign-in messages">
                                    {error && <div className="auth-alert auth-alert--error">{error}</div>}
                                    {rateLimited && (
                                        <div className="auth-alert auth-alert--error rate-limit-message">
                                            <i className="fa-solid fa-clock"></i>
                                            Too many login attempts. Please try again in {retryAfterFormatted}.
                                        </div>
                                    )}
                                    {captchaError && (
                                        <div className="auth-alert auth-alert--error">{captchaError}</div>
                                    )}
                                </div>
                            )}
                            <Captcha ref={captchaRef} onVerify={handleCaptchaVerify} onError={(err: string) => setError(err)} action="login" autoExecute={isCaptchaEnabled()} />
                            <button type="submit" className="auth-submit-btn" disabled={loading || rateLimited || verifying}>
                                {loading || verifying ? 'Logging in...' : 'Login'}
                            </button>
                        </form>
                        <div className="auth-divider"><span>or</span></div>
                        <button type="button" className="auth-submit-btn auth-google-btn" onClick={handleGoogleLogin} disabled={loading || rateLimited}>
                            <GoogleIcon />
                            Continue with Google
                        </button>
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
