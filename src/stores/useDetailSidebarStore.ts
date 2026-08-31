import { create } from 'zustand'

type DetailSidebarState = {
    open: boolean
    alwaysOpen: boolean
    setOpen: (value: boolean) => void
    toggle: () => void
    setAlwaysOpen: (value: boolean) => void
}

export const useDetailSidebarStore = create<DetailSidebarState>((set) => ({
    open: false,
    alwaysOpen: false,
    setOpen: (value) => set({ open: value }),
    toggle: () => set((state) => ({ open: !state.open })),
    setAlwaysOpen: (value) => set({ alwaysOpen: value }),
}))
