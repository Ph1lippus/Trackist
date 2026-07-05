import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'

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
        await supabase.auth.signOut()
        navigate('/')
    }

    return (
        <>
            <nav className="navbar navbar-brand-row">
                <div className="container">
                    <NavLink className="navbar-brand" to="/">TRACKIST</NavLink>
                </div>
            </nav>

            <nav className="navbar navbar-nav-row">
                <div className="container">
                    <ul className="nav nav-pills">
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/">Home</NavLink>
                        </li>
                        {user ? (
                            <>
                                <li className="nav-item">
                                    <span className="nav-link" style={{ opacity: 0.7, cursor: 'default' }}>
                                        {user.email}
                                    </span>
                                </li>
                                <li className="nav-item">
                                    <button className="nav-link" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                        Logout
                                    </button>
                                </li>
                            </>
                        ) : (
                            <>
                                <li className="nav-item">
                                    <NavLink className="nav-link" to="/login">Login</NavLink>
                                </li>
                                <li className="nav-item">
                                    <NavLink className="nav-link" to="/register">Register</NavLink>
                                </li>
                            </>
                        )}
                    </ul>
                </div>
            </nav>
        </>
    )
}

export default Navbar