import React from 'react'

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
                <a className="bottom-nav__item bottom-nav__item--active" href="#">
                    <span>⌂</span>
                    <small>Home</small>
                </a>
                <a className="bottom-nav__item" href="#">
                    <span>🔎</span>
                    <small>Discover</small>
                </a>
                <a className="bottom-nav__item" href="#">
                    <span>▶</span>
                    <small>Watch</small>
                </a>
                <a className="bottom-nav__item" href="#">
                    <span>☰</span>
                    <small>More</small>
                </a>
            </nav>
        </section>
    )
}

export default Dashboard
