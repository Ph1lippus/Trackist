import React from 'react'
import tmdbLogo from '../assets/TMDBLOGO.svg'
import supaBaseLogo from '../assets/supabase-logo-icon.png'
import reactLogo from '../assets/react-favicon.ico'
import viteLogo from '../assets/vite-logo.svg'
import vercelLogo from '../assets/vercel-favicon.ico'
import fontAwesomeLogo from '../assets/fontawesome-favicon.ico'
import { usePageTitle } from '../hooks/usePageTitle'

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
        logo: reactLogo,
        link: 'https://react.dev/'
    },
    {
        title: 'Vite',
        text: 'Built with Vite',
        logo: viteLogo,
        link: 'https://vite.dev/'
    },
    {
        title: 'Vercel',
        text: 'Deployed on Vercel',
        logo: vercelLogo,
        link: 'https://vercel.com/'
    },
    {
        title: 'Font Awesome',
        text: 'Icons by Font Awesome',
        logo: fontAwesomeLogo,
        link: 'https://fontawesome.com/'
    }
]

const Credits: React.FC = () => {
    usePageTitle('Trackist - Credits')
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

                <div className="tmdb-attribution">
                    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                </div>
            </div>
        </section>
    )
}

export default Credits
