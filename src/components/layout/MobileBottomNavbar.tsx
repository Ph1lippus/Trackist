import React from 'react';
import { NavLink  } from 'react-router-dom';
import { CalendarDays, CircleUser, Compass, Film, Tv } from 'lucide-react';
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
        { to: '/MobileTVShows', icon: Tv, label: 'TV Shows'},
        { to: '/Movies', icon: Film, label: 'Movies'},
        { to: '/Discover', icon: Compass, label: 'Discover'},
        { to: '/UpcomingNew', icon: CalendarDays, label: 'Calendar'},
        { to: '/Profile', icon: CircleUser, label: 'Profile'},
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
                            <item.icon size={20} strokeWidth={2.5} />
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;