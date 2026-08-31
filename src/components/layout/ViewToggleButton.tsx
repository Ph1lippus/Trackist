import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, List } from 'lucide-react'
import { isNativePlatform } from '../../services/nativePush'
import { useMobile } from '../../contexts/useMobile'

const ViewToggleButton: React.FC = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { isMobile } = useMobile()

    if (!isNativePlatform() && !isMobile) return null

    const isDesktopPage = location.pathname === '/Movies' || location.pathname === '/Tvshows'
    const isMobilePage = location.pathname === '/MobileMovies' || location.pathname === '/MobileTVShows'
    if (!isDesktopPage && !isMobilePage) return null

    const viewToggleTarget =
        location.pathname === '/Movies' ? '/MobileMovies'
        : location.pathname === '/Tvshows' ? '/MobileTVShows'
        : location.pathname === '/MobileMovies' ? '/Movies'
        : '/Tvshows'

    return (
        <button
            type="button"
            className="view-toggle-btn"
            onClick={() => navigate(viewToggleTarget)}
            title={isDesktopPage ? 'Switch to Mobile View' : 'Switch to Normal View'}
            aria-label={isDesktopPage ? 'Switch to Mobile View' : 'Switch to Normal View'}
        >
            {isDesktopPage ? <List size={16} strokeWidth={2.5} aria-hidden="true" /> : <LayoutGrid size={16} strokeWidth={2.5} aria-hidden="true" />}
        </button>
    )
}

export default ViewToggleButton