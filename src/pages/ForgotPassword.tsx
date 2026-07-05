import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../services/profileService'

const ForgotPassword: React.FC = () => {
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
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-5">
                        <div className="auth-card">
                            <h2 className="auth-title">Reset Password</h2>
                            <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '1.5rem' }}>
                                Enter your email address and we'll send you a link to reset your password.
                            </p>
                            <form onSubmit={handleSubmit} noValidate>
                                <div className="mb-3">
                                    <label htmlFor="reset-email" className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="reset-email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                {error && <div className="alert alert-danger">{error}</div>}
                                {message && <div className="alert alert-info">{message}</div>}
                                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                    {loading ? 'Sending...' : 'Send reset link'}
                                </button>
                            </form>
                            <p className="auth-text mt-3">
                                Remember your password? <Link to="/login" className="auth-link">Login</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default ForgotPassword