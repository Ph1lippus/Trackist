import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { signOutUser } from '../../services/profileService'

const Navbar: React.FC = () => {
    const navigate = useNavigate()
    const { user, profile } = useAuth(true)

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
