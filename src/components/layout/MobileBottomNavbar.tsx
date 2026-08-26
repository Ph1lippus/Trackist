import React from 'react';
import { NavLink  } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const MobileBottomNavbar: React.FC = () => {
    const { user } = useAuth();

    const navItems = [
        { to: '/MobileTVShows', icon: 'fa-tv', label: 'Shows'},
        { to: '/MobileMovies', icon: 'fa-film', label: 'Movies'},
        { to: '/Discover', icon: 'fa-compass', label: 'Discover'},
        { to: '/UpcomingNew', icon: 'fa-calendar-check', label: 'Upcoming'},
        { to: '/Profile', icon: 'fa-circle-user', label: 'Profile'},
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
                        title={item.label}
                        aria-label={item.label}
                    >
                        <i className={`fas ${item.icon}`}></i>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;