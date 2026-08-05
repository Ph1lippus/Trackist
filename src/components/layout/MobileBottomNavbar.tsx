import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const MobileBottomNavbar: React.FC = () => {
    const location = useLocation();
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
                    >
                        <i className={`fas ${item.icon}`}></i>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;