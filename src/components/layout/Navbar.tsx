import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';
import { useSearch } from '../../hooks/useSearch';
import { isNativePlatform } from '../../services/nativePush';
import SearchDropdown from '../search/SearchDropdown';
import ConfirmModal from '../modals/ConfirmModal';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { launchCosmicConfetti } from '../../utils/cosmicConfetti';
import { markShowAsFullyWatched, removeAllWatchedEpisodes } from '../../services/watchlistService';
import { useMobile } from '../../contexts/useMobile';
import { createPortal } from 'react-dom';
import useDiscoverStore, { useDiscoverFilters } from '../../stores/discoverStore';
import type { WatchlistItem } from '../../types';
import useDetailModalStore from '../../stores/detailModalStore';

const NAVBAR_MEDIA_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'movie', label: 'Movies' },
    { value: 'tv', label: 'TV Shows' },
    { value: 'person', label: 'People' },
] as const;

const NAVBAR_SORT_OPTIONS = [
    { value: 'popularity.desc', label: 'Popularity ↓' },
    { value: 'popularity.asc', label: 'Popularity ↑' },
    { value: 'vote_average.desc', label: 'Rating ↓' },
    { value: 'vote_average.asc', label: 'Rating ↑' },
    { value: 'release_date.desc', label: 'Newest' },
    { value: 'release_date.asc', label: 'Oldest' },
] as const;

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
    const [mobileProfileTitle, setMobileProfileTitle] = useState<string>('Profile');
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // Discover search bar: media-type pill + filter menu (Discover page only)
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filtersClosing, setFiltersClosing] = useState(false);
    const filtersRef = useRef<HTMLDivElement>(null);
    const filtersButtonRef = useRef<HTMLButtonElement>(null);
    const discoverFilters = useDiscoverFilters();
    const discoverGenres = useDiscoverStore((state) => state.genres);
    const isDiscoverPage = location.pathname === '/' || location.pathname === '/Discover';
    const thisYear = new Date().getFullYear();
    const hasActiveDiscoverFilters =
        discoverFilters.sortBy !== 'popularity.desc' ||
        discoverFilters.selectedGenres.length > 0 ||
        discoverFilters.yearFrom !== null ||
        discoverFilters.yearTo !== null ||
        discoverFilters.showAdded !== true;

    // Staged filter values (committed via Apply All Filters)
    const [stagedMedia, setStagedMedia] = useState<'all' | 'movie' | 'tv' | 'person'>(discoverFilters.mediaType);
    const [stagedSort, setStagedSort] = useState(discoverFilters.sortBy);
    const [stagedGenres, setStagedGenres] = useState<number[]>(discoverFilters.selectedGenres);
    const [stagedYearFrom, setStagedYearFrom] = useState(discoverFilters.yearFrom != null ? String(discoverFilters.yearFrom) : '');
    const [stagedYearTo, setStagedYearTo] = useState(discoverFilters.yearTo != null ? String(discoverFilters.yearTo) : '');
    const [stagedShowAdded, setStagedShowAdded] = useState(discoverFilters.showAdded);

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
    const isMediaDetailPage = location.pathname.match(/^\/(movie|tv)\/\d+$/) ||
                             location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/);
    const isListDetailPage = location.pathname.match(/^\/ListsDetail\/[a-f0-9-]+$/);
    const isListEditPage = location.pathname.match(/^\/ListsEditPage\/(new|[a-f0-9-]+)$/);
    const isSettingsSubPage = ['/MFA', '/Sessions', '/Settings', '/EditProfile', '/Credits', '/AdminSecurity', '/Statistics'].includes(location.pathname) || location.pathname.startsWith('/Settings/');
    const detailModalOpen = useDetailModalStore((s) => s.isOpen);
    const detailModalType = useDetailModalStore((s) => s.type);
    const isSearchPage = location.pathname === '/Search';
    const showBackButton = Boolean(isDetailPage || isListDetailPage || isListEditPage || isSettingsSubPage || detailModalOpen || isSearchPage);
    
    const showSearchBar = !detailModalOpen && !['/login', '/register'].includes(location.pathname) && 
        (['/Discover', '/Movies', '/Tvshows', '/', '/Finished', '/Search', '/Followers', '/Following', '/Lists', '/MobileTVShows', '/MobileMovies'].includes(location.pathname) || location.pathname.startsWith('/ListsDetail/') || location.pathname.startsWith('/ListsEditPage/') || location.pathname.startsWith('/Followers/') || location.pathname.startsWith('/Following/') || location.pathname === '/MobileTVShows' || location.pathname === '/MobileMovies');
    
    const showCalendarHeader = !detailModalOpen && location.pathname === '/Upcoming' && currentMonth && navigateMonth && canGoBack;
    
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
                        const controller = new AbortController()
                        const timeoutId = setTimeout(() => controller.abort(), 8000)

                        try {
                            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin?_t=${Date.now()}`, {
                                headers: { 'Authorization': `Bearer ${session.access_token}` },
                                signal: controller.signal,
                                cache: 'no-store'
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
                        } finally {
                            clearTimeout(timeoutId)
                        }
                    } catch {
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

    // Discover filter menu open/close
    const closeFilters = useCallback(() => {
        setFiltersClosing(true);
        setTimeout(() => {
            setFiltersOpen(false);
            setFiltersClosing(false);
        }, 150);
    }, []);

    const toggleFilters = useCallback(() => {
        if (filtersOpen) {
            closeFilters();
        } else {
            setFiltersOpen(true);
        }
    }, [filtersOpen, closeFilters]);

    // Sync staged values from the applied store state each time the menu opens
    useEffect(() => {
        if (!filtersOpen) return;
        const s = useDiscoverStore.getState();
        setStagedMedia(s.mediaType);
        setStagedSort(s.sortBy);
        setStagedGenres(s.selectedGenres);
        setStagedYearFrom(s.yearFrom != null ? String(s.yearFrom) : '');
        setStagedYearTo(s.yearTo != null ? String(s.yearTo) : '');
        setStagedShowAdded(s.showAdded);
    }, [filtersOpen]);

    const handleApplyFilters = useCallback(() => {
        const s = useDiscoverStore.getState();
        const from = stagedYearFrom.trim();
        const to = stagedYearTo.trim();
        s.setMediaType(stagedMedia);
        s.setSortBy(stagedSort);
        s.setSelectedGenres(stagedGenres);
        s.setYearRange(
            from === '' || !Number.isFinite(Number(from)) ? null : Number(from),
            to === '' || !Number.isFinite(Number(to)) ? null : Number(to)
        );
        s.setShowAdded(stagedShowAdded);
        closeFilters();
    }, [stagedMedia, stagedSort, stagedGenres, stagedYearFrom, stagedYearTo, stagedShowAdded, closeFilters]);

    const handleCancelAllFilters = useCallback(() => {
        const s = useDiscoverStore.getState();
        s.resetFilters();
        s.setSessionAddedIds(new Set());
        setStagedMedia('all');
        setStagedSort('popularity.desc');
        setStagedGenres([]);
        setStagedYearFrom('');
        setStagedYearTo('');
        setStagedShowAdded(true);
        closeFilters();
    }, [closeFilters]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                filtersRef.current &&
                !filtersRef.current.contains(e.target as Node) &&
                filtersButtonRef.current &&
                !filtersButtonRef.current.contains(e.target as Node)
            ) {
                closeFilters();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeFilters]);

    useEffect(() => {
        if (!filtersOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeFilters();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [filtersOpen, closeFilters]);

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
    const isMoviesPage = location.pathname === '/Movies';
    const isTVShowsPage = location.pathname === '/Tvshows';
    const isFinishedPage = location.pathname === '/Finished';

    const isSelectionActive = isMoviesPage ? moviesSelectionMode : (isTVShowsPage ? tvShowsSelectionMode : (isFinishedPage ? finishedSelectionMode : false));
    const selectedCount = isMoviesPage ? moviesSelectedIds.size : (isTVShowsPage ? tvShowsSelectedIds.size : (isFinishedPage ? finishedSelectedIds.size : 0));

    const handleRandomPick = () => {
        if (isMoviesPage) {
            const planning = movies.filter(m => m.status === 'planning')
            const pool = planning.filter(m => {
                if (!m.release_date) return false
                return new Date(m.release_date) <= new Date()
            })
            if (pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length)
                const randomMovie = pool[randomIndex]
                if (randomMovie.tmdb_id) {
                    useDetailModalStore.getState().open('movie', randomMovie.tmdb_id)
                }
            }
        } else if (isTVShowsPage) {
            const planning = tvShows.filter(show => show.status === 'planning')
            const pool = planning.filter(show => {
                if (!show.release_date) return false
                return new Date(show.release_date) <= new Date()
            })
            if (pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length)
                const randomShow = pool[randomIndex]
                if (randomShow.tmdb_id) {
                    useDetailModalStore.getState().open('tv', randomShow.tmdb_id)
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
        let shouldCelebrate = false;
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
                            shouldCelebrate = true;
                        }
                    }
                }
            } else if (isTVShowsPage) {
                const selectedItems = tvShows.filter(item => tvShowsSelectedIds.has(item.id));
                const refreshedIds: string[] = [];
                
                for (const item of selectedItems) {
                    if (item.tmdb_id) {
                        const newStatus = await markShowAsFullyWatched(item.id, item.tmdb_id);
                        if (newStatus === 'completed' || newStatus === 'caught_up') {
                            shouldCelebrate = true;
                        }
                        refreshedIds.push(item.id);
                    }
                }

                await Promise.all(refreshedIds.map(id => useLibraryStore.getState().refreshItem(id)));
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

            if (shouldCelebrate) {
                launchCosmicConfetti();
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
            case 'movies': return 'Search your movies…';
            case 'tvshows': return 'Search your TV shows…';
            case 'finished': return 'Search finished movies & TV…';
            case 'lists': return 'Search lists…';
            default: return 'Search…';
        }
    })();

    const { isMobile } = useMobile();

    useEffect(() => {
        if (!isMobile || !isNativePlatform()) return;

        const isMediaDetail = isMediaDetailPage ||
            (detailModalOpen &&
                detailModalType !== null &&
                detailModalType !== 'person');

        if (isMediaDetail) {
            void StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
            void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
            return;
        }

        const color = '#2c2b55';

        void StatusBar.setBackgroundColor({ color }).catch(() => {});
        void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    }, [isMobile, showBackButton, isMediaDetailPage, detailModalOpen, detailModalType, isSearchPage]);

    useEffect(() => {
        if (!location.pathname.startsWith('/Profile')) {
            setMobileProfileTitle('Profile');
            return;
        }

        const resolveProfileTitle = async () => {
            try {
                if (location.pathname === '/Profile') {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                        setMobileProfileTitle('Profile');
                        return;
                    }

                    const { data } = await supabase
                        .from('profiles')
                        .select('display_name')
                        .eq('id', user.id)
                        .maybeSingle();

                    setMobileProfileTitle(data?.display_name || 'Profile');
                    return;
                }

                const match = location.pathname.match(/^\/Profile\/(.+)$/);
                if (match) {
                    setMobileProfileTitle(decodeURIComponent(match[1]));
                } else {
                    setMobileProfileTitle('Profile');
                }
            } catch {
                setMobileProfileTitle('Profile');
            }
        };

        void resolveProfileTitle();
    }, [location.pathname]);

    const filterMenuContent = useMemo(() => (
        <div
            ref={filtersRef}
            className={`discover-filter-menu ${filtersOpen ? (filtersClosing ? 'is-closing' : 'is-open') : ''}`}
            data-origin="top-right"
        >
            <div className="discover-filter-menu__inner">
                <div className="discover-filter-menu__header">
                    <span className="discover-filter-menu__header-title">Filters</span>
                    <button
                        type="button"
                        className="discover-filter-menu__header-close"
                        onClick={closeFilters}
                        aria-label="Close filters"
                        title="Close filters"
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="discover-filter-menu__cols">
                    <div className="discover-filter-menu__col">
                        <div className="discover-filter-menu__group">
                            <span className="discover-filter-menu__label">Sort By</span>
                            <div className="discover-filter-menu__tiles discover-filter-menu__tiles--sort">
                                {NAVBAR_SORT_OPTIONS.map((o) => (
                                    <button
                                        key={o.value}
                                        type="button"
                                        className={`discover-filter-menu__btn${stagedSort === o.value ? ' is-selected' : ''}`}
                                        onClick={() => setStagedSort(o.value)}
                                    >
                                        <span>{o.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="discover-filter-menu__col">
                        <div className="discover-filter-menu__group">
                            <span className="discover-filter-menu__label">Year</span>
                            <div className="discover-filter-menu__year-row">
                                <input
                                    type="number"
                                    className="navbar-filter-field navbar-filter-field--year"
                                    placeholder="From"
                                    min={1888}
                                    max={thisYear}
                                    value={stagedYearFrom}
                                    onChange={(e) => setStagedYearFrom(e.target.value)}
                                />
                                <span className="discover-filter-menu__year-sep">–</span>
                                <input
                                    type="number"
                                    className="navbar-filter-field navbar-filter-field--year"
                                    placeholder="To"
                                    min={1888}
                                    max={thisYear}
                                    value={stagedYearTo}
                                    onChange={(e) => setStagedYearTo(e.target.value)}
                                />
                            </div>
                            <span className="discover-filter-menu__hint">Single year or a range — empty box = no limit</span>
                        </div>
                        <div className="discover-filter-menu__group">
                            <span className="discover-filter-menu__label">Watchlist</span>
                            <button type="button" className="discover-filter-menu__row" onClick={() => setStagedShowAdded((v) => !v)}>
                                <span>Show Added</span>
                                <span className={`discover-filter-menu__toggle${stagedShowAdded ? ' on' : ''}`} aria-hidden="true">
                                    <span className="discover-filter-menu__toggle-knob" />
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
                <div className="discover-filter-menu__group">
                    <span className="discover-filter-menu__label">Genres</span>
                    <div className="discover-filter-menu__tiles discover-filter-menu__tiles--genres">
                        {discoverGenres.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                className={`discover-filter-menu__btn${stagedGenres.includes(g.id) ? ' is-selected' : ''}`}
                                onClick={() =>
                                    setStagedGenres((prev) =>
                                        prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                                    )
                                }
                            >
                                <span>{g.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="discover-filter-menu__group discover-filter-menu__group--media">
                    <span className="discover-filter-menu__label">Media</span>
                    <div className="discover-media-pill discover-media-pill--full" role="tablist" aria-label="Media type">
                        {NAVBAR_MEDIA_OPTIONS.map((m) => (
                            <button
                                key={m.value}
                                role="tab"
                                aria-selected={stagedMedia === m.value}
                                className={`discover-media-pill__seg${stagedMedia === m.value ? ' active' : ''}`}
                                onClick={() => setStagedMedia(m.value)}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="discover-filter-menu__footer">
                    <button type="button" className="discover-filter-menu__cancel" onClick={handleCancelAllFilters}>
                        <RotateCcw size={14} strokeWidth={2.5} />
                        Cancel All
                    </button>
                    <button type="button" className="discover-filter-menu__apply" onClick={handleApplyFilters}>
                        <Check size={14} strokeWidth={2.5} />
                        Apply All Filters
                    </button>
                </div>
            </div>
        </div>
    ), [filtersOpen, filtersClosing, stagedSort, stagedYearFrom, stagedYearTo, stagedShowAdded, stagedGenres, stagedMedia, discoverGenres, thisYear, closeFilters, setStagedSort, setStagedYearFrom, setStagedYearTo, setStagedShowAdded, setStagedGenres, setStagedMedia, handleCancelAllFilters, handleApplyFilters]);

    return (
        <nav className={`navbar-brand-row${detailModalOpen ? ' is-modal-open' : ''}`} aria-label="Main navigation">
            <div className={`container navbar-inner${showBackButton ? '' : ' no-back-btn'}${isSearchPage ? ' is-search' : ''}${detailModalOpen ? ' is-modal-open' : ''}`}>
                <div className="navbar-left">
                    {showBackButton && (
                        <button
                            className="navbar-back-btn"
                            onClick={() => {
                                if (detailModalOpen) {
                                    // Pop exactly one layer of the modal stack
                                    // in app state (no browser history involved,
                                    // so one press can never close the whole
                                    // stack). Device/browser Back still works
                                    // through DetailOverlay's popstate handler.
                                    useDetailModalStore.getState().back();
                                } else if (isSearchPage) {
                                    clear();
                                    navigate('/Discover', { replace: true });
                                } else {
                                    navigate(-1);
                                }
                            }}
                            aria-label="Go back"
                        >
                            <ChevronLeft size={16} strokeWidth={2.5} />
                        </button>
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
                                <ChevronLeft size={16} strokeWidth={2.5} />
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
                            <ChevronRight size={16} strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                {isMobile && location.pathname.startsWith('/Profile') && (
                    <div className="navbar-mobile-profile-title" aria-live="polite">
                        {mobileProfileTitle}
                    </div>
                )}
                
                {showSearchBar && (
                    <div className="navbar-search" ref={searchBoxRef}>
                        <div className="navbar-search-row">
                            {isDiscoverPage && (
                                <div className="discover-media-pill" role="tablist" aria-label="Media type">
                                    {NAVBAR_MEDIA_OPTIONS.map((m) => (
                                        <button
                                            key={m.value}
                                            role="tab"
                                            aria-selected={discoverFilters.mediaType === m.value}
                                            className={`discover-media-pill__seg${discoverFilters.mediaType === m.value ? ' active' : ''}`}
                                            onClick={() => useDiscoverStore.getState().setMediaType(m.value)}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <form className="navbar-search-form" onSubmit={handleSearchSubmit}>
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
                                        readOnly={isMobile && location.pathname !== '/Search'}
                                        onFocus={() => {
                                            if (isMobile && location.pathname !== '/Search') {
                                                navigate('/Search')
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (isMobile && location.pathname !== '/Search') {
                                                e.preventDefault()
                                                navigate('/Search')
                                            }
                                        }}
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
                                            <X size={14} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>
                                <SearchDropdown
                                    isOpen={!isMobile && isDropdownOpen}
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
                            </form>
                            {isDiscoverPage && (
                                <div className="navbar-search-filter">
                                    <button
                                        ref={filtersButtonRef}
                                        className={`navbar-filter-btn${filtersOpen ? ' is-active' : ''}`}
                                        onClick={toggleFilters}
                                        aria-label="Discover filters"
                                        aria-expanded={filtersOpen}
                                        title="Filters"
                                    >
                                        <SlidersHorizontal size={16} strokeWidth={2.5} />
                                        {hasActiveDiscoverFilters && <span className="navbar-filter-btn__dot" />}
                                    </button>
                                    {isMobile ? createPortal(filterMenuContent, document.body) : filterMenuContent}
                                </div>
                            )}
                        </div>
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
                                <Loader2 className="lucide-spin" size={16} strokeWidth={2.5} />
                            ) : (
                                <>
                                    <RotateCcw size={16} strokeWidth={2.5} />
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

export default React.memo(Navbar);