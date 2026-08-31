import React, { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../services/profileService'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuthRateLimit } from '../hooks/useAuthRateLimit'
import { useCaptcha, isCaptchaEnabled } from '../hooks/useCaptcha'
import Captcha from '../components/auth/Captcha'
import type { CaptchaHandle } from '../components/auth/Captcha'

const ForgotPassword: React.FC = () => {
    usePageTitle('Track1st - Forgot Password')
    const [email, setEmail] = useState('')
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    
    const { allowed, recordAttempt, retryAfterFormatted, isChecking } = useAuthRateLimit('passwordReset')
    const rateLimited = !allowed && !isChecking
    const { verifyCaptcha, captchaError, verifying } = useCaptcha()
    const [captchaToken, setCaptchaToken] = useState<string | null>(null)
    const captchaRef = useRef<CaptchaHandle>(null)
    const pendingSubmitRef = useRef(false)

    const performReset = useCallback(async (token?: string) => {
        if (loading) return
        setError('')
        setMessage('')

        if (isCaptchaEnabled() && token) {
            const captchaValid = await verifyCaptcha(token)
            if (!captchaValid) {
                setCaptchaToken(null) // Reset token to force new challenge
                pendingSubmitRef.current = false
                return
            }
        }

        setLoading(true)

        const trimmedEmail = email.trim().toLowerCase()
        
        // Small random delay for constant-time response (50-150ms)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))
        
        const { error } = await requestPasswordReset(trimmedEmail)

        setLoading(false)
        pendingSubmitRef.current = false

        if (error) {
            recordAttempt()
            setCaptchaToken(null)
            console.error('Password reset error:', error)
            setError(error.message || 'Unable to process request. Please try again later.')
            return
        }

        setMessage(`If an account exists with this email, a password reset link has been sent to ${trimmedEmail}.`)
        setEmail('')
    }, [loading, email, verifyCaptcha, recordAttempt])

    const handleCaptchaVerify = useCallback((token: string) => {
        setCaptchaToken(token)
        if (pendingSubmitRef.current && token !== '__captcha_disabled__') {
            pendingSubmitRef.current = false
            void performReset(token)
        }
    }, [performReset])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (rateLimited) {
            setError(`Too many reset attempts. Please try again in ${retryAfterFormatted}.`)
            return
        }
        
        // Verify captcha first (skipped when captcha is disabled, e.g. local dev)
        if (isCaptchaEnabled()) {
            if (!captchaToken) {
                pendingSubmitRef.current = true
                captchaRef.current?.execute()
                return
            }

            await performReset(captchaToken)
            return
        }

        await performReset()
    }

    return (
        <main className="main">
            <div className="auth-layout">
                <div className="auth-form-wrapper">
                    <div className="auth-card">
                        <h2 className="auth-title">Reset Password</h2>
                        <p className="auth-description">
                            Enter your email address and we'll send you a link to reset your password.
                        </p>
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="auth-field">
                                <label htmlFor="reset-email" className="auth-label">Email</label>
                                <input
                                    type="email"
                                    className="auth-input"
                                    id="reset-email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            {error && <div className="auth-alert auth-alert--error">{error}</div>}
                            {rateLimited && (
                                <div className="auth-alert auth-alert--error rate-limit-message">
                                    <i className="fa-solid fa-clock"></i>
                                    Too many reset attempts. Please try again in {retryAfterFormatted}.
                                </div>
                            )}
                            {captchaError && (
                                <div className="auth-alert auth-alert--error">{captchaError}</div>
                            )}
                            <Captcha ref={captchaRef} onVerify={handleCaptchaVerify} onError={(err: string) => setError(err)} action="passwordReset" autoExecute={isCaptchaEnabled()} />
                            {message && <div className="auth-alert auth-alert--info">{message}</div>}
                            <button type="submit" className="auth-submit-btn" disabled={loading || rateLimited || verifying}>
                                {loading || verifying ? 'Sending...' : 'Send reset link'}
                            </button>
                        </form>
                        <p className="auth-text">
                            Remember your password? <Link to="/login" className="auth-link">Login</Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default ForgotPassword
