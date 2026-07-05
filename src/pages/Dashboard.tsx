import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const currentlyWatching = [
    { title: 'Attack on Titan', meta: 'Season 4 • 2 episodes left' },
    { title: 'The Witcher', meta: 'Season 3 • 1 episode left' },
    { title: 'Dune: Part Two', meta: 'Movie • In progress' }
]

const discoverGroups = [
    'New anime',
    'Trending movies',
    'TV shows to binge'
]

const Dashboard: React.FC = () => {
    const location = useLocation()
    const isActive = (path: string) => location.pathname === path

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-search-wrap">
                    <input
                        className="dashboard-search"
                        type="text"
                        placeholder="Search anime, movies, TV shows"
                    />
                </div>

                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Currently Watching</h2>
                        <span>Continue where you left off</span>
                    </div>

                    <div className="dashboard-card-grid">
                        {currentlyWatching.map((item) => (
                            <article className="dashboard-card" key={item.title}>
                                <div className="dashboard-card__art" />
                                <div className="dashboard-card__body">
                                    <h3>{item.title}</h3>
                                    <p>{item.meta}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Discover</h2>
                        <span>Fresh picks for your next obsession</span>
                    </div>

                    <div className="dashboard-pill-row">
                        {discoverGroups.map((item) => (
                            <span className="dashboard-pill" key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </div>

            <nav className="bottom-nav" aria-label="Bottom navigation">
                <Link className={`bottom-nav__item ${isActive('/') ? 'bottom-nav__item--active' : ''}`} to="/">
                    <i className="fa-solid fa-house"></i>
                    <small>Home</small>
                </Link>
                <Link className={`bottom-nav__item ${isActive('/discover') ? 'bottom-nav__item--active' : ''}`} to="/discover">
                    <i className="fa-solid fa-compass"></i>
                    <small>Discover</small>
                </Link>
                <Link className={`bottom-nav__item ${isActive('/watchlist') ? 'bottom-nav__item--active' : ''}`} to="/watchlist">
                    <i className="fa-solid fa-play"></i>
                    <small>Watch</small>
                </Link>
                <Link className={`bottom-nav__item ${isActive('/more') ? 'bottom-nav__item--active' : ''}`} to="/more">
                    <i className="fa-solid fa-bars"></i>
                    <small>More</small>
                </Link>
            </nav>
        </section>
    )
}

export default Dashboard
