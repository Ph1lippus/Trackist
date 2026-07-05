import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmail } from '../services/profileService'

const Login: React.FC = () => {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)

        const { data, error: signInError } = await signInWithEmail(email.trim().toLowerCase(), password)

        setLoading(false)

        if (signInError) {
            setError(signInError.message)
            return
        }

        if (data?.session) {
            navigate('/')
        }
    }

    return (
        <main className="main">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-5">
                        <div className="auth-card">
                            <h2 className="auth-title">Welcome Back</h2>
                            <form onSubmit={handleSubmit} noValidate>
                                <div className="mb-3">
                                    <label htmlFor="email" className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="email"
                                        placeholder="Enter your email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="password" className="form-label">Password</label>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            className="form-control"
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
                                {error && <div className="alert alert-danger">{error}</div>}
                                {message && <div className="alert alert-info">{message}</div>}
                                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                    {loading ? 'Logging in...' : 'Login'}
                                </button>
                            </form>
                            <div className="auth-extra-links">
                                <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
                            </div>
                            <p className="auth-text mt-3">
                                Don't have an account? <Link to="/register" className="auth-link">Register</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Login