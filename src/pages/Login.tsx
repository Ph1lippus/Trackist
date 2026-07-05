import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'

const Login: React.FC = () => {
    const navigate = useNavigate()
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const loginIdentifier = identifier.trim()

        const { error } = await supabase.auth.signInWithPassword({
            email: loginIdentifier,
            password
        })

        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }
        navigate('/')
    }

    return (
        <main className="main">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-5">
                        <div className="auth-card">
                            <h2 className="auth-title">Welcome Back</h2>
                            <form onSubmit={handleSubmit} noValidate >
                                <div className="mb-3">
                                    <label htmlFor="identifier" className="form-label">Email or Username</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="identifier"
                                        placeholder="Enter your email or username"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
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
                                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                    {loading ? 'Logging in...' : 'Login'}
                                </button>
                            </form>
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