import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { usePageTitle } from '../hooks/usePageTitle'

const ResetPassword: React.FC = () => {
    usePageTitle('Track1st - Reset Password')
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [tokenValid, setTokenValid] = useState<boolean | null>(null)

    useEffect(() => {
        const hash = window.location.hash
        if (hash) {
            const params = new URLSearchParams(hash.substring(1))
            const accessToken = params.get('access_token')
            const type = params.get('type')

            if (accessToken && type === 'recovery') {
                setTokenValid(true)
            } else {
                setTokenValid(false)
            }
        } else {
            setTokenValid(false)
        }
    }, [])

    const validatePassword = (pwd: string): string | null => {
        if (pwd.length < 8) {
            return 'Password must be at least 8 characters long'
        }
        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setMessage('')

        const passwordError = validatePassword(password)
        if (passwordError) {
            setError(passwordError)
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        setLoading(true)

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password
            })

            if (updateError) {
                if (updateError.message.includes('expired') || updateError.message.includes('invalid')) {
                    setError('This password reset link has expired. Please request a new one.')
                } else {
                    setError('Failed to update password. Please try again.')
                }
                return
            }

            setMessage('Password updated successfully! Redirecting to login...')
            setTimeout(() => {
                navigate('/login')
            }, 2000)
        } catch {
            setError('An unexpected error occurred. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    if (tokenValid === null) {
        return (
            <main className="main">
                <div className="auth-layout">
                    <div className="auth-card">
                        <div className="detail-page-loading" aria-live="polite">Verifying reset link...</div>
                    </div>
                </div>
            </main>
        )
    }

    if (tokenValid === false) {
        return (
            <main className="main">
                <div className="auth-layout">
                    <div className="auth-card">
                        <h2 className="auth-title">Invalid Reset Link</h2>
                        <p className="auth-description">
                            This password reset link is invalid or has expired.
                        </p>
                        <div className="auth-alert auth-alert--error">
                            Please request a new password reset link.
                        </div>
                        <button
                            className="auth-submit-btn"
                            onClick={() => navigate('/forgot-password')}
                        >
                            Request New Link
                        </button>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="main">
            <div className="auth-layout">
                <div className="auth-card">
                    <h2 className="auth-title">Set New Password</h2>
                    <p className="auth-description">
                        Enter your new password below.
                    </p>
                    <form onSubmit={handleSubmit} noValidate>
                        <div className="auth-field">
                            <label htmlFor="password" className="auth-label">New Password</label>
                            <div className="password-input-wrap">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="auth-input"
                                    id="password"
                                    placeholder="Enter new password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
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
                        <div className="auth-field">
                            <label htmlFor="confirm-password" className="auth-label">Confirm New Password</label>
                            <div className="password-input-wrap">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className="auth-input"
                                    id="confirm-password"
                                    placeholder="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>
                        {error && <div className="auth-alert auth-alert--error">{error}</div>}
                        {message && <div className="auth-alert auth-alert--info">{message}</div>}
                        <button
                            type="submit"
                            className="auth-submit-btn"
                            disabled={loading}
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    )
}

export default ResetPassword
