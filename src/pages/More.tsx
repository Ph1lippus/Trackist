import React from 'react'
import { Link } from 'react-router-dom'

const options = [
    { title: 'Profile', blurb: 'Update your nickname and preferences.' },
    { title: 'Lists', blurb: 'Create custom collections for your favorites.' },
    { title: 'Settings', blurb: 'Tune the app to your viewing habits.', route: '/settings' },
    { title: 'Credits', blurb: 'See the services and tools behind Trackist.', route: '/credits' }
]

const More: React.FC = () => {
    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>More</h2>
                        <span>Explore your account options</span>
                    </div>
                    <div className="dashboard-card-grid">
                        {options.map((item) => {
                            const cardContent = (
                                <article className="dashboard-card" key={item.title}>
                                    <div className="dashboard-card__body">
                                        <h3>{item.title}</h3>
                                        <p>{item.blurb}</p>
                                    </div>
                                </article>
                            )

                            return item.route ? (
                                <Link to={item.route} key={item.title} className="text-decoration-none">
                                    {cardContent}
                                </Link>
                            ) : (
                                <div key={item.title}>{cardContent}</div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default More
