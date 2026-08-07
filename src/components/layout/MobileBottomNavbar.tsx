import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const MobileBottomNavbar: React.FC = () => {
    const { user } = useAuth();

    const navItems = [
        { to: '/Tvshows', icon: 'fa-tv'},
        { to: '/Movies', icon: 'fa-film'},
        { to: '/Discover', icon: 'fa-compass'},
        { to: '/UpcomingNew', icon: 'fa-calendar'},
        { to: '/Profile', icon: 'fa-user'},
    ];

    // Don't render if no user
    if (!user) return null;

    return (
        <nav className="mobile-bottom-navbar" aria-label="Mobile navigation">
            <div className="mobile-bottom-navbar-inner">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `mobile-bottom-navbar-link${isActive ? ' active' : ''}`
                        }
                    >
                        <i className={`fas ${item.icon}`}></i>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;