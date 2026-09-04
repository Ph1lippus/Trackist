import React, { useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CircleUser, Compass, Film, Tv } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import useDetailModalStore from '../../stores/detailModalStore';

const getOptimizedAvatarUrl = (url: string, size = 96): string => {
    if (/\/storage\/v1\/(object\/public|render\/image)\//.test(url)) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}width=${size}&height=${size}&resize=cover`;
    }
    return url;
};

const MobileBottomNavbar: React.FC = () => {
    const { user, profile } = useAuth(true);
    const location = useLocation();
    const navigate = useNavigate();

    const navItems = [
        { to: '/MobileTVShows', icon: Tv, label: 'TV Shows'},
        { to: '/Movies', icon: Film, label: 'Movies'},
        { to: '/Discover', icon: Compass, label: 'Discover'},
        { to: '/UpcomingNew', icon: CalendarDays, label: 'Calendar'},
        { to: '/Profile', icon: CircleUser, label: 'Profile'},
    ];

    const activeTo = navItems.find(
        (i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/')
    )?.to;

    const scrollToTop = useCallback(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => window.scrollTo(0, 0), 400);
    }, []);

    const handleTabClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
        if (activeTo !== to) return;

        e.preventDefault();

        const modalWasOpen = useDetailModalStore.getState().isOpen;
        if (modalWasOpen) {
            useDetailModalStore.getState().close();
            window.history.replaceState(null, '', location.pathname + location.search + location.hash);
        }

        if (location.pathname !== to) {
            navigate(to);
        } else if (modalWasOpen) {
            setTimeout(scrollToTop, 0);
        } else {
            scrollToTop();
        }
    }, [activeTo, location.pathname, location.hash, location.search, navigate, scrollToTop]);

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
                        onClick={(e) => handleTabClick(e, item.to)}
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