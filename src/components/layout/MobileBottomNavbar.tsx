import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const MobileBottomNavbar: React.FC = () => {
    const location = useLocation();
    const { user } = useAuth();

    const navItems = [
        { to: '/Discover', icon: 'fa-compass', label: 'Discover' },
        { to: '/Movies', icon: 'fa-film', label: 'Movies' },
        { to: '/Tvshows', icon: 'fa-tv', label: 'TV Shows' },
        { to: '/Upcoming', icon: 'fa-calendar', label: 'Upcoming' },
        { to: '/Finished', icon: 'fa-check-circle', label: 'Finished' },
        { to: '/Lists', icon: 'fa-list', label: 'Lists' },
        { to: '/Friends', icon: 'fa-users', label: 'Friends' },
        { to: '/Statistics', icon: 'fa-chart-bar', label: 'Stats' },
    ];

    // Map pathname to nav item - handle root route redirecting to discover
    const getActiveTabIndex = () => {
        const path = location.pathname === '/' ? '/Discover' : location.pathname;
        // Check for exact match first
        let index = navItems.findIndex(item => item.to === path);
        // If no exact match, check if path starts with a nav item (e.g., /Lists/123 matches /Lists)
        if (index === -1) {
            index = navItems.findIndex(item => path.startsWith(item.to + '/') || path === item.to);
        }
        return index === -1 ? -1 : index;
    };

    const isActivePage = getActiveTabIndex() !== -1;

    // Don't render if no user or not on an active page
    if (!user || !isActivePage) return null;

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
                    >
                        <i className={`fas ${item.icon}`}></i>
                        <span className="mobile-bottom-navbar-label">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;