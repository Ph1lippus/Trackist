import React, { useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const THRESHOLD = 5;

const SecondaryNavbar: React.FC = () => {
    const pillRef = useRef<HTMLSpanElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLElement>(null);
    const location = useLocation();
    const { user } = useAuth();
    const isInitialRender = useRef(true);

    const navItems = [
        { to: '/Discover', label: 'Discover' },
        { to: '/Movies', label: 'Movies' },
        { to: '/Tvshows', label: 'TV Shows' },
        { to: '/Upcoming', label: 'Calendar' },
        { to: '/Lists', label: 'Lists' },
        { to: '/Profile', label: 'Profile' },
    ];

    const getActiveTabIndex = useCallback(() => {
        const path = location.pathname === '/' ? '/Tvshows' : location.pathname;
        let index = navItems.findIndex(item => item.to === path);
        if (index === -1) {
            index = navItems.findIndex(item => path.startsWith(item.to + '/') || path === item.to);
        }
        return index === -1 ? -1 : index;
    }, [location.pathname]);

    const isActivePage = getActiveTabIndex() !== -1;

    useEffect(() => {
        const updatePillPosition = () => {
            const pill = pillRef.current;
            const container = tabsRef.current;
            if (!pill || !container) return;

            const activeTab = container.querySelector(`[data-index="${getActiveTabIndex()}"]`) as HTMLElement;
            if (!activeTab) return;

            if (!isActivePage) {
                pill.style.opacity = '0';
                return;
            }

            pill.style.opacity = '1';

            const shouldAnimate = !isInitialRender.current;
            
            if (shouldAnimate) {
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
            } else {
                pill.style.transition = 'none';
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
                void pill.offsetWidth;
                pill.style.transition = '';
                isInitialRender.current = false;
            }
        };

        const timer = setTimeout(updatePillPosition, 0);
        const timer2 = setTimeout(updatePillPosition, 100);

        window.addEventListener('resize', updatePillPosition);
        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
            window.removeEventListener('resize', updatePillPosition);
        };
    }, [getActiveTabIndex, isActivePage]);

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

    // Hyper-responsive scroll hide/show for the secondary navbar (desktop only)
    const scrollStateRef = useRef({ lastScrollY: window.scrollY, isHidden: false });
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        scrollStateRef.current.lastScrollY = window.scrollY;

        const updateVisibility = () => {
            rafRef.current = null;
            const el = navRef.current;
            if (!el) return;
            const state = scrollStateRef.current;
            const currentY = window.scrollY;
            const delta = currentY - state.lastScrollY;

            if (delta > 0 && !state.isHidden) {
                state.isHidden = true;
                el.classList.add('secondary-navbar--hidden');
            } else if (delta < -THRESHOLD && state.isHidden) {
                state.isHidden = false;
                el.classList.remove('secondary-navbar--hidden');
            }
            // On scroll pause (delta === 0) or tiny upward nudge (< THRESHOLD): do nothing

            state.lastScrollY = currentY;
        };

        const onScroll = () => {
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(updateVisibility);
        };

        const onResize = () => {
            const el = navRef.current;
            if (window.innerWidth <= 768) {
                el?.classList.remove('secondary-navbar--hidden');
                scrollStateRef.current.isHidden = false;
                scrollStateRef.current.lastScrollY = window.scrollY;
            }
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            navRef.current?.classList.remove('secondary-navbar--hidden');
            scrollStateRef.current.isHidden = false;
        };
    }, [user]);

    // Reset scroll tracking on route change so the navbar is never seen moving
    // when switching pages.
    useEffect(() => {
        const el = navRef.current;
        if (!el) return;
        el.classList.remove('secondary-navbar--hidden');
        scrollStateRef.current.isHidden = false;
        // Reset the baseline to the new page's scroll position so the navbar
        // doesn't animate out/in merely because the scroll position jumped.
        requestAnimationFrame(() => {
            scrollStateRef.current.lastScrollY = window.scrollY;
        });
    }, [location.pathname]);

    if (!user) return null;

    return (
        <nav ref={navRef} className="secondary-navbar" aria-label="Secondary navigation">
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
