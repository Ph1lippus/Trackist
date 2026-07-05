import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { signOutUser } from '../services/profileService'

const Navbar: React.FC = () => {
    const navigate = useNavigate()
    const [user, setUser] = useState<any>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null)
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null)
        })
        return () => subscription.unsubscribe()
    }, [])

    const handleLogout = async () => {
        await signOutUser()
        navigate('/login')
    }

    const nickname = user?.user_metadata?.username || user?.user_metadata?.nickname || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Viewer'

    return (
        <nav className="navbar navbar-brand-row">
            <div className="container navbar-inner">
                <NavLink className="navbar-brand" to="/">TRACKIST</NavLink>

                <div className="navbar-actions">
                    {user ? (
                        <>
                            <span className="navbar-user">
                                {nickname}
                            </span>
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