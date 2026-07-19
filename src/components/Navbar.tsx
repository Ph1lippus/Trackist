import React, { useEffect, useState, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { signOutUser, getProfile } from '../services/profileService'    

const Navbar: React.FC = () => {
    const navigate = useNavigate()
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<{ display_name: string | null } | null>(null)

    const loadProfile = useCallback(async (userId: string) => {
        const { data } = await getProfile(userId)
        setProfile(data)
    }, [])

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null)
            if (session?.user) {
                loadProfile(session.user.id)
            }
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null)
            if (session?.user) {
                loadProfile(session.user.id)
            }
        })
        return () => subscription.unsubscribe()
    }, [loadProfile])

    const handleLogout = async () => {
        await signOutUser()
        navigate('/login')
    }

    const nickname = profile?.display_name || user?.user_metadata?.username || user?.user_metadata?.nickname || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Viewer'

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                <NavLink className="navbar-brand" to="/">TRACKIST</NavLink>

                <div className="navbar-actions">
                    {user ? (
                        <>
                            <NavLink className="navbar-user" to={`/Profile/${nickname}`} title={nickname}>
                                {nickname}
                            </NavLink>
                            <button className="navbar-action-link" onClick={handleLogout}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <NavLink className="navbar-action-link" to="/login">Login</NavLink>
                            <NavLink className="navbar-action-link" to="/register">Register</NavLink>
                        </>
                    )}
                </div>
            </div>
        </nav>
    )
}

export default Navbar