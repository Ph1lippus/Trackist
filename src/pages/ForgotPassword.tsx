import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../services/profileService'
import { usePageTitle } from '../hooks/usePageTitle'

const ForgotPassword: React.FC = () => {
    usePageTitle('Trackist - Forgot Password')
    const [email, setEmail] = useState('')
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)

        const trimmedEmail = email.trim().toLowerCase()
        const { error } = await requestPasswordReset(trimmedEmail)

        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        setMessage(`If an account exists with this email, a password reset link has been sent to ${trimmedEmail}.`)
        setEmail('')
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
                            {message && <div className="auth-alert auth-alert--info">{message}</div>}
                            <button type="submit" className="auth-submit-btn" disabled={loading}>
                                {loading ? 'Sending...' : 'Send reset link'}
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
