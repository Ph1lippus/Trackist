import React, { useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const SecondaryNavbar: React.FC = () => {
    const pillRef = useRef<HTMLSpanElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const { user } = useAuth();
    const isInitialRender = useRef(true);

    const navItems = [
        { to: '/Discover', label: 'Discover' },
        { to: '/Movies', label: 'Movies' },
        { to: '/Tvshows', label: 'TV Shows' },
        { to: '/Upcoming', label: 'Upcoming' },
        { to: '/Friends', label: 'Friends' },
        { to: '/Statistics', label: 'Statistics' },
    ];

    // Map pathname to nav item - handle root route redirecting to discover
    const getActiveTabIndex = useCallback(() => {
        const path = location.pathname === '/' ? '/Discover' : location.pathname;
        const index = navItems.findIndex(item => item.to === path);
        return index === -1 ? -1 : index;
    }, [location.pathname]);

    const isActivePage = getActiveTabIndex() !== -1;

    // Set pill position on first render, on route change, and on resize
    useEffect(() => {
        const updatePillPosition = () => {
            const pill = pillRef.current;
            const container = tabsRef.current;
            if (!pill || !container) return;

            const activeTab = container.querySelector(`[data-index="${getActiveTabIndex()}"]`) as HTMLElement;
            if (!activeTab) return;

            // Hide pill if not on an active page
            if (!isActivePage) {
                pill.style.opacity = '0';
                return;
            }

            pill.style.opacity = '1';

            const shouldAnimate = !isInitialRender.current;
            
            if (shouldAnimate) {
                // Animate transition on route change
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
            } else {
                // On initial render, snap to position without transition
                pill.style.transition = 'none';
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
                void pill.offsetWidth; // Force reflow
                pill.style.transition = '';
                isInitialRender.current = false;
            }
        };

        // Use multiple attempts to ensure DOM is ready
        const timer = setTimeout(updatePillPosition, 0);
        const timer2 = setTimeout(updatePillPosition, 100);

        // Update on resize
        window.addEventListener('resize', updatePillPosition);
        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
            window.removeEventListener('resize', updatePillPosition);
        };
    }, [getActiveTabIndex, isActivePage]);

    // Update pill on clicked tab
    const handleTabClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
        const pill = pillRef.current;
        if (pill) {
            pill.style.transform = `translateX(${e.currentTarget.offsetLeft}px)`;
            pill.style.width = `${e.currentTarget.offsetWidth}px`;
        }
    }, []);

    const scrollToTop = useCallback(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setTimeout(() => window.scrollTo(0, 0), 400)
    }, [])

    // Don't render if no user (after hooks)
    if (!user) return null;

    return (
        <nav className="secondary-navbar" aria-label="Secondary navigation">
            <div className="secondary-navbar-inner" ref={tabsRef} role="tablist">
                <span className="secondary-tabs-pill" ref={pillRef} aria-hidden="true"></span>
                {navItems.map((item, index) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `secondary-navbar-link${isActive && isActivePage ? ' active' : ''}`
                        }
                        role="tab"
                        data-index={index}
                        onClick={handleTabClick}
                    >
                        {item.label}
                    </NavLink>
                ))}
                <button
                    className="secondary-navbar-scroll-top"
                    onClick={scrollToTop}
                    aria-label="Back to top"
                    title="Back to top"
                >
                    <i className="fas fa-chevron-up"></i>
                </button>
            </div>
        </nav>
    );
};

export default SecondaryNavbar;
