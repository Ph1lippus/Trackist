import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import useDetailModalStore from '../../stores/detailModalStore'

const DetailLayout = () => {
  const isModalOpen = useDetailModalStore((s) => s.isOpen)

  useEffect(() => {
    // When the detail is rendered inside the modal overlay, the overlay owns
    // scroll locking and positioning. Only do layout work for direct route access.
    if (isModalOpen) return

    // 1. Hide the scrollbar
    document.body.classList.add('no-scroll')

    // 2. FORCE scroll to the very top of the page
    window.scrollTo(0, 0)

    // 3. Also scroll the html element (safety)
    document.documentElement.scrollTop = 0

    return () => {
      // Restore scrollbar when leaving
      document.body.classList.remove('no-scroll')
    }
  }, [isModalOpen])

  return <Outlet />
}

export default DetailLayout