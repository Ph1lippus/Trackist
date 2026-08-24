import { create } from 'zustand'

type MediaCardIconsState = {
    showIcons: boolean
    setShowIcons: (value: boolean) => void
    toggle: () => void
}

export const useMediaCardIconsStore = create<MediaCardIconsState>((set) => ({
    showIcons: false,
    setShowIcons: (value) => {
        set({ showIcons: value })
        try {
            localStorage.setItem('trackist-show-media-card-icons', value ? '1' : '0')
        } catch {
            // Storage unavailable — fail silently
        }
    },
    toggle: () => set((state) => ({ showIcons: !state.showIcons })),
}))
