import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const BottomNav: React.FC = () => {
    const location = useLocation()
    const isActive = (path: string) => location.pathname === path

    return (
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
                <small>Watchlist</small>
            </Link>
            <Link className={`bottom-nav__item ${isActive('/more') ? 'bottom-nav__item--active' : ''}`} to="/more">
                <i className="fa-solid fa-bars"></i>
                <small>More</small>
            </Link>
        </nav>
    )
}

export default BottomNav
