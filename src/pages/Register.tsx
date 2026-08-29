import React, { useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { checkDisplayNameExists } from '../services/profileService'
import { validateUsername, validateEmail, validatePassword } from '../utils/validation'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuthRateLimit } from '../hooks/useAuthRateLimit'
import { useCaptcha, isCaptchaEnabled } from '../hooks/useCaptcha'
import { checkPasswordBreach, isHIBPEnabled } from '../services/hibpService'
import Captcha from '../components/auth/Captcha'
import type { CaptchaHandle } from '../components/auth/Captcha'
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter'

const Register: React.FC = () => {
    usePageTitle('Track1st - Register')
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    
    const { allowed, recordAttempt, retryAfterFormatted, isChecking } = useAuthRateLimit('register')
    const rateLimited = !allowed && !isChecking
    const { verifyCaptcha, captchaError, verifying } = useCaptcha()
    const [captchaToken, setCaptchaToken] = useState<string | null>(null)
    const captchaRef = useRef<CaptchaHandle>(null)
    const pendingSubmitRef = useRef(false)

    const performRegister = useCallback(async (token?: string) => {
        if (loading) return
        setError('')

        if (isCaptchaEnabled() && token) {
            const captchaValid = await verifyCaptcha(token)
            if (!captchaValid) {
                setCaptchaToken(null) // Reset token to force new challenge
                pendingSubmitRef.current = false
                return
            }
        }

        // Validate username
        const usernameError = validateUsername(username)
        if (usernameError) {
            setError(usernameError)
            pendingSubmitRef.current = false
            return
        }

        // Validate email
        const emailError = validateEmail(email)
        if (emailError) {
            setError(emailError)
            pendingSubmitRef.current = false
            return
        }

        // Validate password
        const passwordError = validatePassword(password)
        if (passwordError) {
            setError(passwordError)
            pendingSubmitRef.current = false
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            pendingSubmitRef.current = false
            return
        }

        // Check password against breach database (HIBP)
        if (isHIBPEnabled() && password.length >= 8) {
            const hibpResult = await checkPasswordBreach(password)
            if (hibpResult.pwned) {
                setError(`This password appeared in ${hibpResult.count} data breaches. Please choose another. <a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer" className="auth-link">Learn more</a>`)
                pendingSubmitRef.current = false
                return
            }
        }

        const cleanedUsername = username.trim()
        const cleanedEmail = email.trim().toLowerCase()

        setLoading(true)

        // Check if username already exists - fail closed on error
        const exists = await checkDisplayNameExists(cleanedUsername)
        if (exists) {
            recordAttempt()
            setError('Account creation failed')
            setLoading(false)
            pendingSubmitRef.current = false
            return
        }

        // Small random delay for constant-time response (50-150ms)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))

        try {
            const { error: signUpError } = await supabase.auth.signUp({
                email: cleanedEmail,
                password,
                options: {
                    data: { username: cleanedUsername }
                }
            })

            if (signUpError) {
                recordAttempt()
                let errorMessage = 'Registration failed. Please try again.'
                if (signUpError.message?.includes('No API key') || signUpError.message?.includes('Invalid path')) {
                    errorMessage = 'Unable to connect to authentication service. Please try again later.'
                }
                setError(errorMessage)
                setLoading(false)
                pendingSubmitRef.current = false
                return
            }

            setLoading(false)
            pendingSubmitRef.current = false
            navigate('/login')
        } catch (err) {
            console.error('Registration error:', err)
            recordAttempt()
            setError('Registration failed. Please try again.')
            setLoading(false)
            pendingSubmitRef.current = false
        }
    }, [loading, username, email, password, confirmPassword, verifyCaptcha, recordAttempt, navigate])

    const handleCaptchaVerify = useCallback((token: string) => {
        setCaptchaToken(token)
        if (pendingSubmitRef.current && token !== '__captcha_disabled__') {
            pendingSubmitRef.current = false
            void performRegister(token)
        }
    }, [performRegister])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (rateLimited) {
            setError(`Too many registration attempts. Please try again in ${retryAfterFormatted}.`)
            return
        }
        
        // Verify captcha first (skipped when captcha is disabled, e.g. local dev)
        if (isCaptchaEnabled()) {
            if (!captchaToken) {
                pendingSubmitRef.current = true
                captchaRef.current?.execute()
                return
            }

            await performRegister(captchaToken)
            return
        }

        await performRegister()
    }

    return (
        <main className="main">
            <div className="auth-layout">
                <div className="auth-form-wrapper">
                    <div className="auth-card">
                        <h2 className="auth-title">Create Account</h2>
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="auth-field">
                                <label htmlFor="username" className="auth-label">Username</label>
                                <input
                                    type="text"
                                    className="auth-input"
                                    id="username"
                                    placeholder="Choose a username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="email" className="auth-label">Email</label>
                                <input
                                    type="email"
                                    className="auth-input"
                                    id="email"
                                    placeholder="you@example.com"
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
                                        placeholder="Min. 12 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={12}
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
                                <PasswordStrengthMeter password={password} showWhenEmpty />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="confirmPassword" className="auth-label">Confirm Password</label>
                                <div className="password-input-wrap">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        className="auth-input"
                                        id="confirmPassword"
                                        placeholder="Confirm your password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                        aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                                    >
                                        <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>
                            {error && <div className="auth-alert auth-alert--error">{error}</div>}
                            {rateLimited && (
                                <div className="auth-alert auth-alert--error rate-limit-message">
                                    <i className="fa-solid fa-clock"></i>
                                    Too many registration attempts. Please try again in {retryAfterFormatted}.
                                </div>
                            )}
                            {captchaError && (
                                <div className="auth-alert auth-alert--error">{captchaError}</div>
                            )}
                            <Captcha ref={captchaRef} onVerify={handleCaptchaVerify} onError={(err: string) => setError(err)} action="register" autoExecute={isCaptchaEnabled()} />
                            <button type="submit" className="auth-submit-btn" disabled={loading || rateLimited || verifying}>
                                {loading || verifying ? 'Creating...' : 'Create Account'}
                            </button>
                        </form>
                        <p className="auth-text">
                            Already have an account? <Link to="/login" className="auth-link">Login</Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Register

