import { useDetailSidebarStore } from '../stores/useDetailSidebarStore'

export function useDetailSidebar() {
    const open = useDetailSidebarStore((state) => state.open)
    const alwaysOpen = useDetailSidebarStore((state) => state.alwaysOpen)
    const setOpen = useDetailSidebarStore((state) => state.setOpen)
    const toggle = useDetailSidebarStore((state) => state.toggle)
    const setAlwaysOpen = useDetailSidebarStore((state) => state.setAlwaysOpen)

    const isOpen = alwaysOpen || open

    return { open, alwaysOpen, isOpen, setOpen, toggle, setAlwaysOpen }
}
