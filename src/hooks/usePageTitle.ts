import { useEffect } from 'react'

// Registry of the latest document title each route path has set. The detail
// overlay reads the NEW page's title from here (synchronously, after the routed
// page's own effects have run) when a real navigation closes an open modal —
// the modal's own pages would otherwise be captured as the "base" title.
const pageTitleRegistry = new Map<string, string>()

// Registry of the latest document title each detail-overlay layer has set,
// keyed by the layer's entry key (type:id:season:episode). Lets the overlay
// re-apply the correct title when the user pops back to an earlier layer —
// hidden layers stay mounted, so nothing else resets the tab title then.
const layerTitleRegistry = new Map<string, string>()

export const getPageTitleForPath = (path: string): string | undefined =>
    pageTitleRegistry.get(path)

export const getLayerTitle = (key: string): string | undefined =>
    layerTitleRegistry.get(key)

export const usePageTitle = (title: string, layerKey?: string): void => {
    useEffect(() => {
        document.title = title
        if (layerKey) {
            layerTitleRegistry.set(layerKey, title)
        } else {
            pageTitleRegistry.set(window.location.pathname, title)
        }
        // NOTE: deliberately keyed on `title` only, never on location.pathname.
        // Detail pages rendered inside the overlay stay mounted through the
        // modal's exit fade; if this effect re-ran on a route change it would
        // clobber the title the newly-navigated page just set, leaving the tab
        // stuck on the modal's title. Route changes remount the routed page,
        // which runs this effect with the new title anyway.
    }, [title, layerKey])
}