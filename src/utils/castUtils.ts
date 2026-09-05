/**
 * Utilities for curating cast lists. TMDB credits expose a billing `order`
 * (0 = leading role) that varies between a show's series-level credits and its
 * per-season credits. These helpers combine those sources so the detail pages
 * show a clean, meaningful cast: only members with a profile photo, deduped by
 * id (keeping each person's best/lowest order), sorted by billing.
 */

export interface CastCredit {
    id?: number
    name?: string
    character?: string | null
    profile_path?: string | null
    order?: number
}

const hasPhoto = (c: CastCredit): boolean =>
    typeof c.profile_path === 'string' && c.profile_path.trim() !== ''

const getBillingOrder = (c: CastCredit): number =>
    typeof c.order === 'number' && Number.isFinite(c.order) ? c.order : Number.MAX_SAFE_INTEGER

/**
 * Merge one or more cast sources and curate the result:
 *  - dedupe by id, keeping each person's best (lowest) billing order
 *  - drop members without a profile photo
 *  - sort by billing order (no/unknown order sorts last)
 */
export const curateCast = <T extends CastCredit>(...sources: T[][]): Array<T & { id: number }> => {
    const byId = new Map<number, T>()
    for (const source of sources) {
        for (const c of source) {
            if (!c || typeof c !== 'object' || typeof c.id !== 'number') continue
            const existing = byId.get(c.id)
            if (!existing || getBillingOrder(c) < getBillingOrder(existing)) {
                byId.set(c.id, c)
            }
        }
    }
    return Array.from(byId.values())
        .filter(hasPhoto)
        .sort((a, b) => getBillingOrder(a) - getBillingOrder(b)) as Array<T & { id: number }>
}