import React from 'react'
import tmdbLogo from '../assets/TMDBLOGO.svg'
import supaBaseLogo from '../assets/supabase-logo-icon.png'

const credits = [
    {
        title: 'TMDB',
        text: 'Powered by TMDb',
        logo: tmdbLogo,
        link: 'https://www.themoviedb.org/'
    },
    {
        title: 'Supabase',
        text: 'Database & Auth by Supabase',
        logo:  supaBaseLogo,
        link: 'https://supabase.com/'
    },
    {
        title: 'React',
        text: 'Built with React',
        logo: 'https://react.dev/favicon.ico',
        link: 'https://react.dev/'
    },
    {
        title: 'Vite',
        text: 'Built with Vite',
        logo: 'https://vite.dev/logo.svg',
        link: 'https://vite.dev/'
    },
    {
        title: 'Vercel',
        text: 'Deployed on Vercel',
        logo: 'https://assets.vercel.com/image/upload/front/favicon/favicon.ico',
        link: 'https://vercel.com/'
    },
    {
        title: 'Font Awesome',
        text: 'Icons by Font Awesome',
        logo: 'https://fontawesome.com/favicon.ico',
        link: 'https://fontawesome.com/'
    }
]

const Credits: React.FC = () => {
    return (
        <section className="credits-page">
            <div className="dashboard-section">
                <div className="dashboard-section__head">
                    <h2>Credits</h2>
                    <span>Tools and services that helped shape Trackist</span>
                </div>

                <div className="credits-grid">
                    {credits.map((item) => (
                        <article className="credit-card" key={item.title}>
                            <img className="credit-card__logo" src={item.logo} alt={`${item.title} logo`} />
                            <h3 className="credit-card__title">{item.title}</h3>
                            <p className="credit-card__text">{item.text}</p>
                            <a className="credit-card__link" href={item.link} target="_blank" rel="noreferrer">
                                Visit {item.title}
                            </a>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default Credits
