import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';
import { useSearch } from '../../hooks/useSearch';
import SearchDropdown from '../search/SearchDropdown';
import ConfirmModal from '../modals/ConfirmModal';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { launchCosmicConfetti } from '../../utils/cosmicConfetti';
import { markShowAsFullyWatched, removeAllWatchedEpisodes } from '../../services/watchlistService';
import type { WatchlistItem } from '../../types';

interface NavbarProps {
    currentMonth?: Date;
    navigateMonth?: (direction: number) => void;
    canGoBack?: () => boolean;
    goToToday?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentMonth, navigateMonth, canGoBack, goToToday }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState<User | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [batchLoading, setBatchLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // Selection state
    const {
        moviesSelectionMode,
        moviesSelectedIds,
        setMoviesSelectionMode,
        clearMovieSelection,
        tvShowsSelectionMode,
        tvShowsSelectedIds,
        setTVShowsSelectionMode,
        clearTVShowSelection,
        finishedSelectionMode,
        finishedSelectedIds,
        setFinishedSelectionMode,
        clearFinishedSelection,
    } = useSelectionStore();

    const movies = useLibraryStore((state) => state.movies);
    const tvShows = useLibraryStore((state) => state.tvShows);
    const finished = useLibraryStore((state) => state.finished);

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
    const isListDetailPage = location.pathname.match(/^\/ListsDetail\/[a-f0-9-]+$/);
    const isListEditPage = location.pathname.match(/^\/ListsEditPage\/(new|[a-f0-9-]+)$/);
    const showBackButton = Boolean(isDetailPage || isListDetailPage || isListEditPage);
    
    const showSearchBar = !['/login', '/register'].includes(location.pathname) && 
        (['/Discover', '/Movies', '/Tvshows', '/', '/Finished', '/Friends', '/Followers', '/Following', '/Lists', '/MobileTVShows', '/MobileMovies'].includes(location.pathname) || location.pathname.startsWith('/ListsDetail/') || location.pathname.startsWith('/ListsEditPage/') || location.pathname.startsWith('/Followers/') || location.pathname.startsWith('/Following/') || location.pathname === '/MobileTVShows' || location.pathname === '/MobileMovies');
    
    const showCalendarHeader = location.pathname === '/Upcoming' && currentMonth && navigateMonth && canGoBack;
    
    const monthName = currentMonth ? currentMonth.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
    }) : '';

    useEffect(() => {
        let lastCheck = 0
        const CHECK_COOLDOWN = 30000

        const checkAdmin = async () => {
            try {
                const now = Date.now()
                if (now - lastCheck < CHECK_COOLDOWN) return
                lastCheck = now

                const { data: { session } } = await supabase.auth.getSession()
                setUser(session?.user || null)

                if (session?.access_token) {
                    try {
                        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin`, {
                            headers: { 'Authorization': `Bearer ${session.access_token}` }
                        })
                        if (res.ok) {
                            const data = await res.json()
                            setIsAdmin(data.isAdmin === true)
                        } else {
                            setIsAdmin(false)
                        }
                    } catch (fetchError) {
                        console.error('[Navbar] verify-admin fetch failed:', fetchError)
                        setIsAdmin(false)
                    }
                }
            } catch {
                setIsAdmin(false)
            }
        }

        checkAdmin()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null)
            if (session?.access_token) {
                checkAdmin()
            } else {
                setIsAdmin(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

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
        setShowLogoutModal(true);
    };

    const handleLogoutConfirm = async () => {
        setShowLogoutModal(false);
        await supabase.auth.signOut();
        navigate('/login');
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Commit the query for full-page results
        commitQuery();
    }

    const handleSearchClear = () => {
        clear();
    }

    // Selection helpers
    const isMoviesPage = location.pathname === '/Movies' || location.pathname === '/MobileMovies';
    const isTVShowsPage = location.pathname === '/Tvshows' || location.pathname === '/MobileTVShows';
    const isFinishedPage = location.pathname === '/Finished';
    const isSelectionActive = isMoviesPage ? moviesSelectionMode : (isTVShowsPage ? tvShowsSelectionMode : (isFinishedPage ? finishedSelectionMode : false));
    const selectedCount = isMoviesPage ? moviesSelectedIds.size : (isTVShowsPage ? tvShowsSelectedIds.size : (isFinishedPage ? finishedSelectedIds.size : 0));

    const handleRandomPick = () => {
        if (isMoviesPage) {
            const planning = movies.filter(m => m.status === 'planning')
            const pool = planning.filter(m => {
                if (!m.release_date) return true
                return new Date(m.release_date) <= new Date()
            })
            if (pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length)
                const randomMovie = pool[randomIndex]
                if (randomMovie.tmdb_id) {
                    navigate(`/movie/${randomMovie.tmdb_id}`)
                }
            }
        } else if (isTVShowsPage) {
            const planning = tvShows.filter(show => show.status === 'planning')
            const pool = planning.filter(show => {
                if (!show.release_date) return true
                return new Date(show.release_date) <= new Date()
            })
            if (pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length)
                const randomShow = pool[randomIndex]
                if (randomShow.tmdb_id) {
                    navigate(`/tv/${randomShow.tmdb_id}`)
                }
            }
        }
        closeMenu()
    }

    const showRandomPick = (isMoviesPage || isTVShowsPage) && !isSelectionActive

    const handleToggleSelectionMode = () => {
        if (isMoviesPage) {
            setMoviesSelectionMode(!moviesSelectionMode);
        } else if (isTVShowsPage) {
            setTVShowsSelectionMode(!tvShowsSelectionMode);
        } else if (isFinishedPage) {
            setFinishedSelectionMode(!finishedSelectionMode);
        }
    };

    const handleClearSelection = () => {
        if (isMoviesPage) {
            clearMovieSelection();
        } else if (isTVShowsPage) {
            clearTVShowSelection();
        } else if (isFinishedPage) {
            clearFinishedSelection();
        }
    };

    const handleBatchMarkWatched = async () => {
        if (selectedCount === 0) return;

        setBatchLoading(true);
        try {
            if (isMoviesPage) {
                const selectedItems = movies.filter(item => moviesSelectedIds.has(item.id));
                
                for (const item of selectedItems) {
                    const isMovieReleased = (item: WatchlistItem): boolean => {
                        if (!item.release_date) return true;
                        const releaseDate = new Date(item.release_date);
                        const today = new Date();
                        return releaseDate <= today;
                    };

                    if (isMovieReleased(item)) {
                        await useLibraryStore.getState().updateStatus(item.id, 'completed');
                        if (item.status === 'planning') {
                            launchCosmicConfetti();
                        }
                    }
                }
            } else if (isTVShowsPage) {
                const selectedItems = tvShows.filter(item => tvShowsSelectedIds.has(item.id));
                
                for (const item of selectedItems) {
                    if (item.tmdb_id) {
                        await markShowAsFullyWatched(item.id, item.tmdb_id);
                        await useLibraryStore.getState().refreshItem(item.id);
                    }
                }
            } else if (isFinishedPage) {
                const selectedTVShows = finished.filter(item => (item.media_type === 'tv' || item.media_type === 'anime') && finishedSelectedIds.has(item.id));
                const selectedMovies = finished.filter(item => item.media_type === 'movie' && finishedSelectedIds.has(item.id));

                for (const item of selectedTVShows) {
                    await removeAllWatchedEpisodes(item.id);
                    await useLibraryStore.getState().refreshItem(item.id);
                }

                for (const item of selectedMovies) {
                    await useLibraryStore.getState().updateStatus(item.id, 'planning');
                    await useLibraryStore.getState().refreshItem(item.id);
                }
            }
            
            handleClearSelection();
        } catch (err) {
            console.error('Failed to batch operation:', err);
        } finally {
            setBatchLoading(false);
        }
    };

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
                        <div className="calendar-header-left">
                            <button 
                                className="calendar-nav-btn-inline"
                                onClick={() => navigateMonth(-1)}
                                title="Previous month"
                                disabled={!canGoBack()}
                                style={{ opacity: canGoBack() ? 1 : 0.3, cursor: canGoBack() ? 'pointer' : 'not-allowed' }}
                            >
                                <i className="fas fa-chevron-left"></i>
                            </button>
                            <button 
                                className="calendar-today-btn"
                                onClick={() => goToToday?.()}
                                title="Go to current month"
                            >
                                Today
                            </button>
                        </div>
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
                                 {isAdmin && (
                                     <button className="t-dropdown-item" onClick={() => {
                                         closeMenu();
                                         navigate('/Admin');
                                     }}>
                                         Admin Center
                                     </button>
                                 )}
                                 <button className="t-dropdown-item" onClick={() => {
                                     closeMenu();
                                     navigate('/Profile');
                                 }}>
                                     Profile
                                 </button>
                                 {showRandomPick && (
                                     <button className="t-dropdown-item" onClick={handleRandomPick}>
                                         {isMoviesPage ? 'Random Movie' : 'Random TV Show'}
                                     </button>
                                 )}
                                 {(isMoviesPage || isTVShowsPage || isFinishedPage) && !isSelectionActive && (
                                     <button className="t-dropdown-item" onClick={() => {
                                         closeMenu();
                                         handleToggleSelectionMode();
                                     }}>
                                         Selection
                                     </button>
                                 )}
                                 <button className="t-dropdown-item" onClick={() => {
                                     closeMenu();
                                     navigate('/Settings');
                                 }}>
                                     Settings
                                 </button>
                                 <button className="t-dropdown-item" onClick={() => {
                                     closeMenu();
                                     navigate('/Credits');
                                 }}>
                                     Credits
                                 </button>
                                  <button className="t-dropdown-item" onClick={handleLogout}>
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
            
            {/* Selection Mode Action Bar */}
            {isSelectionActive && (
                <div className="selection-action-bar">
                    <span className="selection-count">{selectedCount} selected</span>
                    <div className="selection-actions">
                        <button
                            className="selection-action-btn selection-action-btn--cancel"
                            onClick={handleClearSelection}
                        >
                            Cancel
                        </button>
                        <button
                            className="selection-action-btn selection-action-btn--confirm"
                            onClick={handleBatchMarkWatched}
                            disabled={selectedCount === 0 || batchLoading}
                        >
                            {batchLoading ? (
                                <i className="fa-solid fa-spinner fa-spin"></i>
                            ) : (
                                <>
                                    <i className="fa-solid fa-rotate-left"></i>
                                    {isFinishedPage ? 'Mark as Unwatched' : 'Mark as Watched'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
            
            <ConfirmModal
                isOpen={showLogoutModal}
                title="Logout"
                message="Are you sure you want to logout?"
                onConfirm={handleLogoutConfirm}
                onCancel={() => setShowLogoutModal(false)}
                confirmText="Logout"
                confirmColor="danger"
            />
        </nav>
    );
};

export default Navbar;