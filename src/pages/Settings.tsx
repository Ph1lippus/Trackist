import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { requestPasswordReset, updateUserEmail } from '../services/profileService'

const Settings: React.FC = () => {
    const [username, setUsername] = useState('')
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [emailLoading, setEmailLoading] = useState(false)
    const [resetLoading, setResetLoading] = useState(false)

    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.user_metadata) {
                setUsername(user.user_metadata.username || '')
                setFullName(user.user_metadata.full_name || '')
            }
            if (user?.email) {
                setEmail(user.email)
            }
        }

        void loadProfile()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        const { data: { user }, error } = await supabase.auth.updateUser({
            data: {
                username,
                full_name: fullName
            }
        })

        setLoading(false)

        if (error) {
            setMessage(error.message)
            return
        }

        if (user) {
            setMessage('Profile updated successfully')
        }
    }

    const handleEmailUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setEmailLoading(true)
        setMessage('')

        const { error } = await updateUserEmail(email.trim().toLowerCase())

        setEmailLoading(false)

        if (error) {
            setMessage(error.message)
            return
        }

        setMessage('A confirmation link has been sent to your new email address.')
    }

    const handlePasswordReset = async () => {
        if (!email) {
            setMessage('Please provide an email address first')
            return
        }

        setResetLoading(true)
        setMessage('')

        const { error } = await requestPasswordReset(email.trim().toLowerCase())

        setResetLoading(false)

        if (error) {
            setMessage(error.message)
            return
        }

        setMessage('A password reset link has been sent to your email.')
    }

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Settings</h2>
                        <span>Update your profile details</span>
                    </div>

                    <form className="auth-card" onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="form-label">Username</label>
                            <input
                                className="form-control"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Full name</label>
                            <input
                                className="form-control"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Enter your full name"
                            />
                        </div>

                        {message && <div className="alert alert-info">{message}</div>}

                        <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save changes'}
                        </button>
                    </form>

                    <form className="auth-card mt-4" onSubmit={handleEmailUpdate}>
                        <div className="mb-3">
                            <label className="form-label">Email address</label>
                            <input
                                className="form-control"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your new email"
                            />
                        </div>
                        <button className="btn btn-outline-primary w-100" type="submit" disabled={emailLoading}>
                            {emailLoading ? 'Sending confirmation...' : 'Change email'}
                        </button>
                    </form>

                    <div className="auth-card mt-4">
                        <button className="btn btn-outline-secondary w-100" type="button" onClick={handlePasswordReset} disabled={resetLoading}>
                            {resetLoading ? 'Sending reset link...' : 'Send password reset link'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Settings
