import React, { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

const Settings: React.FC = () => {
    const [username, setUsername] = useState('')
    const [fullName, setFullName] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.user_metadata) {
                setUsername(user.user_metadata.username || '')
                setFullName(user.user_metadata.full_name || '')
            }
        }

        loadProfile()
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
                </div>
            </div>
        </section>
    )
}

export default Settings
