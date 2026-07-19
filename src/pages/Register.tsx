import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { checkDisplayNameExists } from '../services/profileService'
import { validateUsername, validateEmail, validatePassword } from '../utils/validation'

const Register: React.FC = () => {
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Validate username
        const usernameError = validateUsername(username)
        if (usernameError) {
            setError(usernameError)
            return
        }

        // Validate email
        const emailError = validateEmail(email)
        if (emailError) {
            setError(emailError)
            return
        }

        // Validate password
        const passwordError = validatePassword(password)
        if (passwordError) {
            setError(passwordError)
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        const cleanedUsername = username.trim()
        const cleanedEmail = email.trim().toLowerCase()

        setLoading(true)

        // Check if username already exists
        try {
            const exists = await checkDisplayNameExists(cleanedUsername)
            if (exists) {
                setError('Username already taken')
                setLoading(false)
                return
            }
        } catch {
            // Continue with registration even if username check fails
        }

        try {
            const { error: signUpError } = await supabase.auth.signUp({
                email: cleanedEmail,
                password,
                options: {
                    data: { username: cleanedUsername }
                }
            })

            if (signUpError) {
                let errorMessage = signUpError.message || 'Registration failed'
                if (signUpError.message?.includes('No API key') || signUpError.message?.includes('Invalid path')) {
                    errorMessage = 'Unable to connect to authentication service. Please try again later.'
                }
                setError(errorMessage)
                setLoading(false)
                return
            }

            setLoading(false)
            navigate('/login')
        } catch (err) {
            console.error('Registration error:', err)
            const errorObj = err as { message?: string; error?: string }
            const errorMessage = errorObj?.message || errorObj?.error || 'Registration failed. Please try again.'
            setError(errorMessage)
            setLoading(false)
        }
    }

    return (
        <main className="main">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-5">
                        <div className="auth-card">
                            <h2 className="auth-title">Create Account</h2>
                            <form onSubmit={handleSubmit} noValidate>
                                <div className="mb-3">
                                    <label htmlFor="username" className="form-label">Username</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="username"
                                        placeholder="Choose a username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="email" className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="email"
                                        placeholder="you@example.com"
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
                                            placeholder="Min. 8 characters"
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
                                <div className="mb-3">
                                    <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            className="form-control"
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
                                {error && <div className="alert alert-danger">{error}</div>}
                                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                    {loading ? 'Creating...' : 'Create Account'}
                                </button>
                            </form>
                            <p className="auth-text mt-3">
                                Already have an account? <Link to="/login" className="auth-link">Login</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Register