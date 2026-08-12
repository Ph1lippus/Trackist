import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLibraryStore } from '../../stores/useLibraryStore';

const MobileBottomNavbar: React.FC = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const movies = useLibraryStore((state) => state.movies);
    const tvShows = useLibraryStore((state) => state.tvShows);

    const isMoviesPage = location.pathname === '/Movies' || location.pathname === '/MobileMovies';
    const isTVShowsPage = location.pathname === '/Tvshows' || location.pathname === '/MobileTVShows';

    const handleRandomPick = () => {
        if (isMoviesPage && movies.length > 0) {
            const randomIndex = Math.floor(Math.random() * movies.length)
            const randomMovie = movies[randomIndex]
            if (randomMovie.tmdb_id) {
                navigate(`/movie/${randomMovie.tmdb_id}`)
            }
        } else if (isTVShowsPage) {
            const notStarted = tvShows.filter(show => show.status === 'planning')
            const pool = notStarted.length > 0 ? notStarted : tvShows
            if (pool.length > 0) {
                const randomIndex = Math.floor(Math.random() * pool.length)
                const randomShow = pool[randomIndex]
                if (randomShow.tmdb_id) {
                    navigate(`/tv/${randomShow.tmdb_id}`)
                }
            }
        }
    }

    const navItems = [
        { to: '/MobileTVShows', icon: 'fa-tv'},
        { to: '/Movies', icon: 'fa-film'},
        { to: '/Discover', icon: 'fa-compass'},
        { to: '/UpcomingNew', icon: 'fa-calendar'},
        { to: '/Profile', icon: 'fa-user'},
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
                    >
                        <i className={`fas ${item.icon}`}></i>
                    </NavLink>
                ))}
                {(isMoviesPage || isTVShowsPage) && (
                    <button
                        className="mobile-random-pick-btn"
                        onClick={handleRandomPick}
                        title={isMoviesPage ? 'Pick random movie' : 'Pick random TV show'}
                        aria-label={isMoviesPage ? 'Pick random movie' : 'Pick random TV show'}
                    >
                        <i className="fa-solid fa-shuffle"></i>
                    </button>
                )}
            </div>
        </nav>
    );
};

export default MobileBottomNavbar;