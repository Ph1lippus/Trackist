import useDetailModalStore from '../stores/detailModalStore'

// True when this detail is the currently-visible one on screen.
//
// - Standalone routed pages are always active (the modal overlay is closed).
// - Inside the overlay every layer stays mounted (previous details remain
//   rendered underneath the top one), but only the TOP layer is actually
//   visible. Deeper layers and the routed page underneath must therefore not
//   render their fixed mobile action bars — their portals escape the
//   `display:none` layer container and would otherwise float above the modal
//   (e.g. a person modal opened over a TV show leaves the TV show's sidebar
//   floating with no toggle to close it).
export function useIsActiveDetail(
    type: 'movie' | 'tv' | 'episode',
    id?: string,
    season?: string,
    episode?: string
): boolean {
    const isOpen = useDetailModalStore((s) => s.isOpen)
    const top = useDetailModalStore((s) => (s.isOpen && s.stack.length > 0 ? s.stack[s.stack.length - 1] : null))

    if (!isOpen || !top) return true
    return (
        top.type === type &&
        top.id === Number(id) &&
        String(top.season ?? '') === String(season ?? '') &&
        String(top.episode ?? '') === String(episode ?? '')
    )
}