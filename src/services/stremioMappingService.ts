/**
 * Translates a TMDB aired-order episode coordinate into the season/episode
 * coordinates Stremio expects, for shows whose seasons are grouped differently
 * between the two.
 *
 * Stremio resolves metadata through Cinemeta (its default meta addon), which is
 * built from IMDb's season tree. TMDB's default `seasons` array follows the
 * original broadcast order and frequently disagrees - it can merge or split
 * whole story arcs. Lupin (TMDB 96677) is the clearest example:
 *
 *   TMDB    Season 1 "Season 1" = Part 1 (E1-E5) + Part 2 (E6-E10) = 10 eps
 *   TMDB    Season 2 "Part 3"   = 7 eps
 *   Cinemeta Season 1 = Part 1 (E1-E5), Season 2 = Part 2 (E1-E5),
 *           Season 3 = Part 3, Season 4 = Part 4
 *
 * Feeding raw TMDB coordinates into a Stremio deep link therefore resolves to
 * the wrong episode - TMDB `2:1` lands on Part 1 Chapter 6 instead of Part 3
 * Chapter 1 - or to nothing at all when the episode number exceeds the
 * corresponding Cinemeta season length.
 *
 * TMDB publishes the correct grouping itself, but only through the dedicated
 * episode-group endpoints (`/tv/{id}/episode_groups`,
 * `/tv/episode_group/{id}`); the default seasons array never references it.
 *
 * Those groups are numerous and overlapping - Dragon Ball Z Kai has 17, eleven of
 * them covering the whole show - and most are NOT the ordering Cinemeta uses, so
 * this module verifies a candidate against Cinemeta before trusting it. Three
 * signals are used, strongest first:
 *
 *   1. `moviedb_id`  Cinemeta echoes the TMDB *episode* id for each video, so
 *                    this is an exact join and settles it outright. Present for
 *                    only some shows (Lupin, One Piece) but never ambiguous.
 *   2. `title`       Only populated for the same subset of shows.
 *   3. air dates     Present for every video, so this is the workhorse.
 *                    Measured agreement for groups that really are Cinemeta's
 *                    ordering runs 84-100%, while wrong groups land between
 *                    0.3% and 63% (Attack on Titan's "Original Production by
 *                    Seasons" scores 0.8%), which separates them cleanly.
 *
 * Matching on season-shape alone was tried and rejected: it scored 80% for that
 * same wrong Attack on Titan group and would have shipped a wrong-episode link.
 *
 * Every failure path reports "no mapping" so callers keep the raw coordinate -
 * an unmapped link behaves as it does today, a wrong one is strictly worse.
 */

import { getTVEpisodeGroup, getTVEpisodeGroups } from './tmdbService'
import { getCachedOrFetch } from './cacheService'
import type { TVEpisodeGroupDetail, TVEpisodeGroupSummary } from '../types'

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io/meta/series'

/** Cinemeta's own upstream cache is 14 days; keep ours shorter so fixes land. */
const CINEMETA_TTL = 7 * 24 * 60 * 60 * 1000
const EPISODE_GROUPS_TTL = 24 * 60 * 60 * 1000
const EPISODE_GROUP_TTL = 24 * 60 * 60 * 1000

/** How many candidate groups we are willing to download and score. */
const MAX_CANDIDATES = 5

/**
 * The Stremio button awaits this resolution, so it must always terminate. The
 * work is several dependent round trips (Cinemeta, then TMDB's episode-group
 * list, then up to MAX_CANDIDATES group bodies), and any of them could stall.
 *
 * Exceeding the budget falls back to the raw coordinate, which is exactly what
 * the button did before this module existed - so the worst case is the old
 * behaviour, never a wrong episode.
 */
const RESOLVE_BUDGET_MS = 6000

/**
 * Deadline for the single Cinemeta request. It is aborted rather than merely
 * raced, so a stalled connection is cancelled instead of left running.
 *
 * Kept a little under RESOLVE_BUDGET_MS so this is normally what ends the work;
 * the outer budget is the backstop for anything slower or unexpected.
 */
const CINEMETA_TIMEOUT_MS = 4000

/** A group must clear one of these to be used instead of the aired order. */
const EXACT_ID_THRESHOLD = 0.9
const TITLE_THRESHOLD = 0.9
const DATE_THRESHOLD = 0.8

/** Below this, a handful of coincidental matches is weaker evidence than simply trusting TMDB. */
const MIN_COMPARABLE = 5

export interface StremioEpisodeCoord {
    season: number
    episode: number
}

/**
 * What the Stremio button should link to.
 *
 * - `{ kind: 'episode' }` - use these coordinates in `createEpisodeDeepLink`.
 * - `{ kind: 'series' }`  - Stremio has no video for this episode under any
 *   ordering, so link to the show itself instead of a dead episode link.
 * - `null`                - TMDB's aired order is already correct (or we could
 *   not check); the caller should use the coordinates it already has.
 */
export type StremioLinkTarget =
    | { kind: 'episode'; season: number; episode: number }
    | { kind: 'series' }
    | null

interface CinemetaVideo {
    season: number
    episode: number
    title?: string
    date?: string
    tmdbEpisodeId?: number
}

interface CinemetaMeta {
    videos: CinemetaVideo[]
    /** Distinct season numbers present; used to rank candidates before fetching them. */
    seasonCount: number
    has: (season: number, episode: number) => boolean
}

interface GroupMapping {
    /** "airedSeason:airedEpisode" -> "groupOrder:groupEpisode" */
    entries: Map<string, string>
    /** Evidence tier that accepted this group, for logging. */
    tier: 'moviedb_id' | 'title' | 'date'
    score: number
}

const normaliseTitle = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : ''

const toDay = (value: unknown): string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''

/**
 * Fetches and indexes the season/episode tree Stremio will actually use for an
 * IMDb id. Returns null on any failure, so the caller keeps today's behaviour
 * rather than degrading into a broken link.
 */
const getCinemetaMeta = async (imdbId: string): Promise<CinemetaMeta | null> => {
    const id = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`
    try {
        const data = await getCachedOrFetch(
            'stremio-cinemeta',
            id,
            async () => {
                const res = await fetch(`${CINEMETA_BASE}/${id}.json`, {
                    signal: AbortSignal.timeout(CINEMETA_TIMEOUT_MS),
                })
                if (!res.ok) throw new Error(`Cinemeta error: ${res.status} ${res.statusText}`)
                return await res.json()
            },
            { ttl: CINEMETA_TTL }
        )

        const rawVideos = Array.isArray(data?.meta?.videos) ? data.meta.videos : []
        if (!rawVideos.length) return null

        const videos: CinemetaVideo[] = []
        const lookup = new Set<string>()
        const seasons = new Set<number>()

        for (const raw of rawVideos) {
            if (!raw || typeof raw !== 'object') continue
            const source = raw as Record<string, unknown>
            const season = Number(source.season)
            const episode = Number(source.episode)
            if (!Number.isFinite(season) || !Number.isFinite(episode)) continue

            videos.push({
                season,
                episode,
                title: normaliseTitle(source.title) || undefined,
                date: toDay(source.released) || toDay(source.firstAired) || undefined,
                tmdbEpisodeId: Number.isFinite(Number(source.moviedb_id)) ? Number(source.moviedb_id) : undefined,
            })
            lookup.add(`${season}:${episode}`)
            seasons.add(season)
        }

        if (!videos.length) return null

        return { videos, seasonCount: seasons.size, has: (season, episode) => lookup.has(`${season}:${episode}`) }
    } catch (error) {
        console.warn('[stremioMapping] Cinemeta lookup failed:', error)
        return null
    }
}

/**
 * Builds the aired-order -> group-order lookup for one episode group and
 * decides whether Cinemeta agrees that this is the ordering it serves.
 *
 * A group's episodes carry their ORIGINAL (aired) season/episode plus an `order`
 * that is a zero-based index WITHIN their sub-group - so the episode number the
 * group exposes is `order + 1`. The TMDB `episode_number` field is NOT the
 * group's numbering; it is the number in the aired season, which is exactly what
 * makes the mapping possible in the first place.
 */
const evaluateGroup = (detail: TVEpisodeGroupDetail, meta: CinemetaMeta): GroupMapping | null => {
    const entries = new Map<string, string>()
    /** aired "s:e" -> TMDB episode id, used for the exact-join signal. */
    const airedEpisodeIds = new Map<string, number>()
    let titleOk = 0
    let titleBad = 0
    let dateOk = 0
    let dateBad = 0

    for (const group of detail?.groups ?? []) {
        const order = Number(group?.order)
        if (!Number.isFinite(order)) continue

        for (const episode of group?.episodes ?? []) {
            const airedSeason = Number(episode?.season_number)
            const airedEpisode = Number(episode?.episode_number)
            const position = Number(episode?.order)
            if (!Number.isFinite(airedSeason) || !Number.isFinite(airedEpisode) || !Number.isFinite(position)) continue

            const airedKey = `${airedSeason}:${airedEpisode}`
            const groupedEpisode = position + 1
            entries.set(airedKey, `${order}:${groupedEpisode}`)

            if (episode?.id != null) airedEpisodeIds.set(airedKey, Number(episode.id))

            const target = meta.videos.find(v => v.season === order && v.episode === groupedEpisode)

            if (target?.title) {
                const expected = normaliseTitle(episode?.name)
                if (expected) {
                    if (expected === target.title) titleOk++
                    else titleBad++
                }
            }

            const sourceDate = toDay(episode?.air_date)
            if (sourceDate && target?.date) {
                if (sourceDate === target.date) dateOk++
                else dateBad++
            }
        }
    }

    if (!entries.size) return null

    // 1. Exact join on TMDB episode id. Only available for the subset of shows
    //    where Cinemeta echoes `moviedb_id`, but when present it is definitive.
    if (meta.videos.some(v => v.tmdbEpisodeId != null)) {
        let exactOk = 0
        let exactBad = 0
        for (const [airedKey, groupedKey] of entries) {
            const tmdbEpisodeId = airedEpisodeIds.get(airedKey)
            if (tmdbEpisodeId == null) continue
            const truth = meta.videos.find(v => v.tmdbEpisodeId === tmdbEpisodeId)
            if (!truth) continue
            const [groupSeason, groupEpisode] = groupedKey.split(':').map(Number)
            if (truth.season === groupSeason && truth.episode === groupEpisode) exactOk++
            else exactBad++
        }
        if (exactOk + exactBad >= MIN_COMPARABLE) {
            const score = exactOk / (exactOk + exactBad)
            if (score >= EXACT_ID_THRESHOLD) return { entries, tier: 'moviedb_id', score }
            return null
        }
    }

    // 2. Titles, available for the same subset of shows.
    if (titleOk + titleBad >= MIN_COMPARABLE) {
        const score = titleOk / (titleOk + titleBad)
        if (score >= TITLE_THRESHOLD) return { entries, tier: 'title', score }
        return null
    }

    // 3. Air dates, available everywhere.
    if (dateOk + dateBad >= MIN_COMPARABLE) {
        const score = dateOk / (dateOk + dateBad)
        if (score >= DATE_THRESHOLD) return { entries, tier: 'date', score }
        return null
    }

    // No signal had enough data to judge. Prefer TMDB's aired order.
    return null
}

/** Evidence ranking, strongest first. */
const TIER_RANK: Record<GroupMapping['tier'], number> = { moviedb_id: 3, title: 2, date: 1 }

const isBetter = (candidate: GroupMapping, incumbent: GroupMapping | null): boolean => {
    if (!incumbent) return true
    const candidateRank = TIER_RANK[candidate.tier]
    const incumbentRank = TIER_RANK[incumbent.tier]
    if (candidateRank !== incumbentRank) return candidateRank > incumbentRank
    return candidate.score > incumbent.score
}

/**
 * Decides what the Stremio button should link to for an aired-order episode.
 *
 * `baseEpisodeTotal` is the sum of `episode_count` across the show's default
 * `seasons` array, which the caller already has on hand from `/tv/{id}`.
 *
 * Never throws, never returns a coordinate Stremio does not have, and always
 * settles within RESOLVE_BUDGET_MS so the button can never sit disabled waiting
 * on the network.
 */
export const resolveStremioTarget = async (
    tmdbId: number,
    imdbId: string | null | undefined,
    airedSeason: number,
    airedEpisode: number,
    baseEpisodeTotal: number
): Promise<StremioLinkTarget> => {
    // The Stremio deep link is only ever built from an IMDb id; without one we
    // have no way to check Stremio's structure, so leave the link untouched.
    if (!imdbId) return null

    // Specials are excluded from most episode groups, so no group can improve
    // on season 0.
    if (airedSeason === 0) return null

    let timer: ReturnType<typeof setTimeout> | undefined
    const budget = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
            console.warn('[stremioMapping] Resolution exceeded budget; using the aired-order coordinate')
            resolve(null)
        }, RESOLVE_BUDGET_MS)
    })

    try {
        return await Promise.race([resolveTarget(tmdbId, imdbId, airedSeason, airedEpisode, baseEpisodeTotal), budget])
    } finally {
        // Clear the timer on every path, including the losing race, so a fast
        // resolution doesn't leave a pending timer holding the event loop.
        if (timer !== undefined) clearTimeout(timer)
    }
}

const resolveTarget = async (
    tmdbId: number,
    imdbId: string,
    airedSeason: number,
    airedEpisode: number,
    baseEpisodeTotal: number
): Promise<StremioLinkTarget> => {
    const meta = await getCinemetaMeta(imdbId)
    if (!meta) return null

    const target = await resolveWithGroups(tmdbId, meta, airedSeason, airedEpisode, baseEpisodeTotal)
    if (target) return target

    // No verified remap. If the raw coordinate is one Stremio does not have,
    // the episode link would be dead either way, so fall back to the show.
    // (One Piece's Cinemeta entry covers 52 of TMDB's 1219 episodes, so
    // S5E1 exists in TMDB but nowhere in Stremio.)
    if (!meta.has(airedSeason, airedEpisode)) return { kind: 'series' }

    return null
}

const resolveWithGroups = async (
    tmdbId: number,
    meta: CinemetaMeta,
    airedSeason: number,
    airedEpisode: number,
    baseEpisodeTotal: number
): Promise<StremioLinkTarget> => {
    // Without a trustworthy total we cannot tell a complete group from a
    // partial one, and a partial group would leave most episodes unmapped.
    if (!Number.isFinite(baseEpisodeTotal) || baseEpisodeTotal <= 0) return null

    try {
        const summaries = await getCachedOrFetch(
            'tmdb-episode-groups',
            tmdbId,
            () => getTVEpisodeGroups(tmdbId),
            { ttl: EPISODE_GROUPS_TTL }
        )
        if (!summaries?.length) return null

        // Only groups covering the entire show can remap every episode. Partial
        // groups (Breaking Bad's DVD set is 62 of 71, Game of Thrones' aired
        // order is 102 of 373) would silently leave most episodes unmapped.
        // Type 1 is "Original aired", i.e. the ordering we already have.
        const candidates = summaries.filter(
            (summary: TVEpisodeGroupSummary) =>
                summary?.id &&
                typeof summary.episode_count === 'number' &&
                summary.episode_count > 0 &&
                summary.type !== 1 &&
                summary.episode_count === baseEpisodeTotal
        )
        if (!candidates.length) return null

        // Cheap prefilter: a group whose sub-group count is nowhere near the
        // number of seasons Cinemeta exposes is unlikely to be its ordering.
        // Keeps heavily-partitioned shows from turning one click into a dozen
        // requests. It only orders the queue - every candidate is still scored
        // on evidence, so a poor guess here costs a request, not correctness.
        const ranked = [...candidates].sort(
            (a, b) =>
                Math.abs((a.group_count ?? 0) - meta.seasonCount) - Math.abs((b.group_count ?? 0) - meta.seasonCount)
        )

        let best: GroupMapping | null = null
        let bestName: string | null = null

        for (const summary of ranked.slice(0, MAX_CANDIDATES)) {
            let detail: TVEpisodeGroupDetail
            try {
                detail = await getCachedOrFetch(
                    'tmdb-episode-group',
                    summary.id,
                    () => getTVEpisodeGroup(summary.id),
                    { ttl: EPISODE_GROUP_TTL }
                )
            } catch (error) {
                console.warn('[stremioMapping] Failed to load episode group', summary.id, error)
                continue
            }

            const mapping = evaluateGroup(detail, meta)
            if (!mapping) continue
            if (isBetter(mapping, best)) {
                best = mapping
                bestName = summary.name
            }
        }

        if (!best) return null

        const mappedKey = best.entries.get(`${airedSeason}:${airedEpisode}`)
        if (!mappedKey) return null

        const [season, episode] = mappedKey.split(':').map(Number)
        if (!Number.isFinite(season) || !Number.isFinite(episode)) return null

        // Final guard: never hand Stremio a coordinate it has no video for. This
        // is the case for legitimately unreleased episodes (Lupin Part 4 airs
        // after Cinemeta's snapshot), where the series-level link is correct.
        if (!meta.has(season, episode)) return null

        console.debug(`[stremioMapping] tmdb ${airedSeason}:${airedEpisode} -> ${season}:${episode} via '${bestName}' (${best.tier} ${(best.score * 100).toFixed(1)}%)`)
        return { kind: 'episode', season, episode }
    } catch (error) {
        console.warn('[stremioMapping] Episode group resolution failed:', error)
        return null
    }
}