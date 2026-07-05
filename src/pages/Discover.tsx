import React from 'react'

const items = [
    { title: 'Blue Lock', type: 'Anime', blurb: 'High-intensity sports drama with a ruthless training regime.' },
    { title: 'Silo', type: 'TV Series', blurb: 'A mystery thriller set beneath a sealed underground world.' },
    { title: 'The Creator', type: 'Movie', blurb: 'A visually striking sci-fi adventure about AI and identity.' }
]

const Discover: React.FC = () => {
    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-search-wrap">
                    <input className="dashboard-search" placeholder="Discover anime, movies, and shows" />
                </div>

                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Popular Right Now</h2>
                        <span>Fresh picks for your queue</span>
                    </div>
                    <div className="dashboard-card-grid">
                        {items.map((item) => (
                            <article className="dashboard-card" key={item.title}>
                                <div className="dashboard-card__art" />
                                <div className="dashboard-card__body">
                                    <h3>{item.title}</h3>
                                    <p>{item.type}</p>
                                    <p>{item.blurb}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Discover
