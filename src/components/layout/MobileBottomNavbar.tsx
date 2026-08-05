import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const MobileBottomNavbar: React.FC = () => {
    const { user } = useAuth();

    const navItems = [
        { to: '/Discover', icon: 'fa-compass'},
        { to: '/Movies', icon: 'fa-film'},
        { to: '/Tvshows', icon: 'fa-tv'},
        { to: '/Upcoming', icon: 'fa-calendar'},
        { to: '/Finished', icon: 'fa-check-circle'},
        { to: '/Lists', icon: 'fa-list'},
        { to: '/Friends', icon: 'fa-users'},
        { to: '/Statistics', icon: 'fa-chart-bar'},
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