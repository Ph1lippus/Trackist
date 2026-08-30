import React from 'react';
import { NavLink  } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const getOptimizedAvatarUrl = (url: string, size = 96): string => {
    if (/\/storage\/v1\/(object\/public|render\/image)\//.test(url)) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}width=${size}&height=${size}&resize=cover`;
    }
    return url;
};

const MobileBottomNavbar: React.FC = () => {
    const { user, profile } = useAuth(true);

    const navItems = [
        { to: '/MobileTVShows', icon: 'fa-tv', label: 'TV Shows'},
        { to: '/Movies', icon: 'fa-film', label: 'Movies'},
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
                        {item.to === '/Profile' && profile?.avatar_url ? (
                            <img
                                src={getOptimizedAvatarUrl(profile.avatar_url)}
                                alt={profile.display_name || 'Profile'}
                                className="mobile-bottom-navbar-avatar"
                                draggable={false}
                            />
                        ) : (
                            <i className={`fas ${item.icon}`}></i>
                        )}
                        <span className="mobile-bottom-navbar-label">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;