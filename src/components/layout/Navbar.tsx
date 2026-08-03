import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';
import { useSearch } from '../../hooks/useSearch';
import SearchDropdown from '../search/SearchDropdown';
import ProgressFixModal from '../modals/ProgressFixModal';
import { clearAllCache } from '../../services/cacheService';

interface NavbarProps {
    currentMonth?: Date;
    navigateMonth?: (direction: number) => void;
    canGoBack?: () => boolean;
}

const Navbar: React.FC<NavbarProps> = ({ currentMonth, navigateMonth, canGoBack }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState<User | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [showFixModal, setShowFixModal] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // Unified search engine
    const {
        inputValue,
        setInputValue,
        isLoading,
        results,
        groupedResults,
        context,
        query,
        belowMinChars,
        error,
        isDropdownOpen,
        closeDropdown,
        clear,
        commitQuery,
    } = useSearch();

    const isDetailPage = location.pathname.match(/^\/(movie|tv|person)\/\d+$/) || 
                          location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/);
    const showBackButton = Boolean(isDetailPage);
    
    const showSearchBar = ['/Discover', '/Movies', '/Tvshows', '/', '/Finished', '/Friends', '/Lists', '/Lists/new'].includes(location.pathname) || location.pathname.startsWith('/Lists/');
    
    const showCalendarHeader = location.pathname === '/Upcoming' && currentMonth && navigateMonth && canGoBack;
    
    const monthName = currentMonth ? currentMonth.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
    }) : '';

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const closeMenu = useCallback(() => {
        setClosing(true);
        setTimeout(() => {
            setMenuOpen(false);
            setClosing(false);
        }, 150); // matches --dropdown-close-dur
    }, []);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)
            ) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeMenu]);

    const toggleMenu = useCallback(() => {
        if (menuOpen) {
            closeMenu();
        } else {
            setMenuOpen(true);
        }
    }, [menuOpen, closeMenu]);

    const handleLogout = async () => {
        closeMenu();
        // Ask for confirmation before logout
        if (window.confirm('Are you sure you want to logout?')) {
            await supabase.auth.signOut();
            navigate('/login');
        }
    };

    const handleClearCache = async () => {
        closeMenu();
        // Ask for confirmation before clearing cache
        if (window.confirm('Are you sure you want to clear all cache? This will remove all cached data and may slow down the app temporarily.')) {
            await clearAllCache();
            // Reload the page to refresh all data
            window.location.reload();
        }
    };

    const nickname = user?.user_metadata?.username 
        || user?.user_metadata?.nickname 
        || user?.user_metadata?.full_name 
        || user?.email?.split('@')[0] 
        || 'Viewer';

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Commit the query for full-page results
        commitQuery();
    }

    const handleSearchClear = () => {
        clear();
    }

    // Context-aware placeholder text
    const searchPlaceholder = (() => {
        switch (context) {
            case 'discover': return 'Search movies, TV, people, lists…';
            case 'movies': return 'Search movies…';
            case 'tvshows': return 'Search TV shows…';
            case 'finished': return 'Search finished movies & TV…';
            case 'friends': return 'Search users…';
            case 'lists': return 'Search lists…';
            default: return 'Search…';
        }
    })();

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                <div className="navbar-left">
                    {showBackButton && (
                        <i
                            className="fa-solid fa-chevron-left navbar-back-btn"
                            onClick={() => {
                                sessionStorage.setItem('scrollPosition', window.scrollY.toString());
                                navigate(-1);
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Go back"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
                                    navigate(-1);
                                }
                            }}
                        />
                    )}
                </div>
                
                {showCalendarHeader && (
                    <div className="calendar-header">
                        <button 
                            className="calendar-nav-btn-inline"
                            onClick={() => navigateMonth(-1)}
                            title="Previous month"
                            disabled={!canGoBack()}
                            style={{ opacity: canGoBack() ? 1 : 0.3, cursor: canGoBack() ? 'pointer' : 'not-allowed' }}
                        >
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <h2 className="calendar-title">{monthName}</h2>
                        <button 
                            className="calendar-nav-btn-inline"
                            onClick={() => navigateMonth(1)}
                            title="Next month"
                        >
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                )}
                
                {showSearchBar && (
                    <div className="navbar-search" ref={searchBoxRef}>
                        <form onSubmit={handleSearchSubmit}>
                            <div className="navbar-search-box">
                                <svg className="navbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="M21 21l-4.35-4.35" />
                                </svg>
                                <input
                                    type="text"
                                    className="navbar-search-input"
                                    placeholder={searchPlaceholder}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    autoComplete="off"
                                    spellCheck="false"
                                />
                                {isLoading && (
                                    <div className="navbar-search-spinner" aria-label="Searching">
                                        <div className="discover-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                    </div>
                                )}
                                {inputValue && !isLoading && (
                                    <button type="button" className="navbar-search-clear" onClick={handleSearchClear} aria-label="Clear search">
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>
                        </form>
                        <SearchDropdown
                            isOpen={isDropdownOpen}
                            isLoading={isLoading}
                            results={results}
                            groupedResults={groupedResults}
                            context={context}
                            query={query}
                            belowMinChars={belowMinChars}
                            error={error}
                            onClose={closeDropdown}
                            onCommit={commitQuery}
                        />
                    </div>
                )}
                
                <div className="navbar-actions">
                    {user ? (
                        <>
                            <div className="navbar-user-wrap">
                                <NavLink 
                                    className="navbar-user" 
                                    to="/Profile"
                                    title={nickname}
                                >
                                    {nickname}
                                </NavLink>
                            </div>
                            <div className="t-dropdown-wrap">
                                <button
                                    ref={buttonRef}
                                    className="navbar-menu-btn"
                                    onClick={toggleMenu}
                                    aria-label="Menu"
                                    aria-expanded={menuOpen}
                                >
                                    <div className={`navbar-hamburger ${menuOpen ? 'is-active' : ''}`}>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                    </div>
                                </button>
                                <div
                                    ref={menuRef}
                                    className={`t-dropdown ${menuOpen ? (closing ? 'is-closing' : 'is-open') : ''}`}
                                    data-origin="top-right"
                                >
                                <button className="t-dropdown-item" onClick={() => {
                                        closeMenu();
                                        setShowFixModal(true);
                                    }}>
                                        <i className="fa-solid fa-wrench"></i>
                                        Fix Progress
                                    </button>
                                    <button className="t-dropdown-item" onClick={handleClearCache}>
                                        <i className="fa-solid fa-trash"></i>
                                        Clear Cache
                                    </button>
                                    <button className="t-dropdown-item" onClick={() => {
                                        closeMenu();
                                        navigate('/Settings');
                                    }}>
                                        <i className="fa-solid fa-gear"></i>
                                        Settings
                                    </button>
                                    <button className="t-dropdown-item" onClick={handleLogout}>
                                        <i className="fa-solid fa-right-from-bracket"></i>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/login"
                            >
                                Login
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/register"
                            >
                                Register
                            </NavLink>
                        </>
                    )}
                </div>
            </div>
            <ProgressFixModal
                isOpen={showFixModal}
                onClose={() => setShowFixModal(false)}
                onComplete={() => {
                    // Refresh the current page if on a watchlist page
                    window.dispatchEvent(new CustomEvent('watchlist-refresh'))
                }}
            />
        </nav>
    );
};

export default Navbar;