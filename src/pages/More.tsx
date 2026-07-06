import React from 'react'
import { Link } from 'react-router-dom'

const options = [
    { title: 'Settings', blurb: 'Tune the app to your viewing habits.', route: '/settings' },
    { title: 'Credits', blurb: 'See the services and tools behind Trackist.', route: '/credits' }
]

const More: React.FC = () => {
    return (
        <section className="more-page">
            <div className="more-container">
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>More</h2>
                        <span>Account & app settings</span>
                    </div>
                    <div className="more-grid">
                        {options.map((item) => (
                            <Link to={item.route} key={item.title} className="more-card">
                                <h3>{item.title}</h3>
                                <p>{item.blurb}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default More
