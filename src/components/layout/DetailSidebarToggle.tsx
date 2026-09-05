import React from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useMobile } from '../../contexts/useMobile'
import { useDetailSidebar } from '../../hooks/useDetailSidebar'
import useDetailModalStore from '../../stores/detailModalStore'

const isDetailPage = (pathname: string): boolean =>
    /^\/(movie|tv)\/\d+$/.test(pathname) ||
    /^\/tv\/\d+\/season\/\d+\/episode\/\d+$/.test(pathname)

const DetailSidebarToggle: React.FC = () => {
    const location = useLocation()
    const { isMobile } = useMobile()
    const { isOpen, alwaysOpen, toggle } = useDetailSidebar()
    const isModalOpen = useDetailModalStore((state) => state.isOpen)
    const modalType = useDetailModalStore((state) => state.type)

    if (!isMobile || alwaysOpen) return null

    // Person pages/modals render no action bar, so there is no sidebar to toggle.
    const showable = isDetailPage(location.pathname) || (isModalOpen && modalType !== 'person')
    if (!showable) return null

    return (
        <button
            className={`detail-sidebar-toggle${isOpen ? ' detail-sidebar-toggle--open' : ''}`}
            onClick={toggle}
            aria-label={isOpen ? 'Close detail sidebar' : 'Open detail sidebar'}
            aria-expanded={isOpen}
            title={isOpen ? 'Close detail sidebar' : 'Open detail sidebar'}
        >
            {isOpen ? <PanelLeftClose size={18} strokeWidth={2.5} /> : <PanelLeftOpen size={18} strokeWidth={2.5} />}
        </button>
    )
}

export default DetailSidebarToggle
