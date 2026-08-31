import React from 'react'
import tmdbLogo from '../assets/TMDBLOGO.svg'
import supaBaseLogo from '../assets/supabase-logo-icon.png'
import reactLogo from '../assets/react-favicon.ico'
import viteLogo from '../assets/vite-logo.svg'
import vercelLogo from '../assets/vercel-favicon.ico'
import fontAwesomeLogo from '../assets/fontawesome-favicon.ico'
import bootstrapLogo from '../assets/bootstrap-logo.svg'
import reactRouterLogo from '../assets/react-router-logo.svg'
import typescriptLogo from '../assets/typescript-logo.svg'
import pwaLogo from '../assets/pwa-logo.svg'
import zustandLogo from '../assets/zustand-logo.svg'
import hcaptchaLogo from '../assets/hcaptcha-logo.svg'
import stremioLogo from '../assets/stremio-logo-icon-only-fullcolor.svg'
import letterboxdLogo from '../assets/letterboxd-decal-dots-pos-rgb-500px.png'
import qrcodeLogo from '../assets/qrcode-icon.svg'
import zxcvbnLogo from '../assets/zxcvbn-icon.svg'
import virtuosoLogo from '../assets/bi-list.svg'
import confettiLogo from '../assets/bi-stars.svg'
import cropLogo from '../assets/bi-crop.svg'
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
    },
    {
        title: 'Bootstrap',
        text: 'UI framework',
        logo: bootstrapLogo,
        link: 'https://getbootstrap.com/'
    },
    {
        title: 'React Router',
        text: 'Client-side routing',
        logo: reactRouterLogo,
        link: 'https://reactrouter.com/'
    },
    {
        title: 'Zustand',
        text: 'State management',
        logo: zustandLogo,
        link: 'https://zustand.docs.pmnd.rs/'
    },
    {
        title: 'React Virtuoso',
        text: 'Virtualized lists',
        logo: virtuosoLogo,
        link: 'https://virtuoso.dev/'
    },
    {
        title: 'TypeScript',
        text: 'Typed JavaScript',
        logo: typescriptLogo,
        link: 'https://www.typescriptlang.org/'
    },
    {
        title: 'PWA',
        text: 'Offline support & installability',
        logo: pwaLogo,
        link: 'https://vite-pwa-org.netlify.app/'
    },
    {
        title: 'hCaptcha',
        text: 'Bot & spam protection',
        logo: hcaptchaLogo,
        link: 'https://www.hcaptcha.com/'
    },
    {
        title: 'Stremio',
        text: 'Open episodes in your media player',
        logo: stremioLogo,
        link: 'https://www.stremio.com/'
    },
    {
        title: 'Letterboxd',
        text: 'Jump to movie pages on Letterboxd',
        logo: letterboxdLogo,
        link: 'https://letterboxd.com/'
    },
    {
        title: 'qrcode.react',
        text: 'QR codes for 2FA',
        logo: qrcodeLogo,
        link: 'https://github.com/zpao/qrcode.react'
    },
    {
        title: 'zxcvbn-ts',
        text: 'Password strength estimator',
        logo: zxcvbnLogo,
        link: 'https://zxcvbn-ts.github.io/zxcvbn/'
    },
    {
        title: 'canvas-confetti',
        text: 'Celebrations & confetti',
        logo: confettiLogo,
        link: 'https://github.com/catdad/canvas-confetti'
    },
    {
        title: 'react-easy-crop',
        text: 'Avatar image cropping',
        logo: cropLogo,
        link: 'https://github.com/ValentinH/react-easy-crop'
    }
]

const Credits: React.FC = () => {
    usePageTitle('Track1st - Credits')
    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage">
                    <div className="settings-panel__header">
                        <div className="settings-panel__title-row">
                            <span className="settings-panel__title-icon"><img src={tmdbLogo} alt="" style={{ width: '18px', height: '18px' }} /></span>
                            <h3>Credits</h3>
                        </div>
                        <p>Tools and services that helped shape Track1st.</p>
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
                        <p>hCaptcha is a registered trademark of Intuition Machines, Inc.</p>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Credits
