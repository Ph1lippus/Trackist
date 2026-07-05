import React from 'react'

const watchlist = [
    { title: 'Naruto', status: 'Watching', note: 'Season 2 • 3 episodes left' },
    { title: 'Interstellar', status: 'Planned', note: 'Movie • Add to queue' },
    { title: 'Wednesday', status: 'Paused', note: 'Season 1 • Halfway through' }
]

const Watchlist: React.FC = () => {
    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Your Watchlist</h2>
                        <span>Keep track of what matters</span>
                    </div>
                    <div className="dashboard-card-grid">
                        {watchlist.map((item) => (
                            <article className="dashboard-card" key={item.title}>
                                <div className="dashboard-card__art" />
                                <div className="dashboard-card__body">
                                    <h3>{item.title}</h3>
                                    <p>{item.status}</p>
                                    <p>{item.note}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Watchlist
