import { useMediaCardIconsStore } from '../stores/useMediaCardIconsStore'

export function useMediaCardIcons() {
    const showIcons = useMediaCardIconsStore((state) => state.showIcons)
    const toggle = useMediaCardIconsStore((state) => state.toggle)
    const setShowIcons = useMediaCardIconsStore((state) => state.setShowIcons)

    return { showIcons, toggle, setShowIcons }
}
