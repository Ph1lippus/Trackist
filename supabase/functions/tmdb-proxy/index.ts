import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')
const BASE = 'https://api.themoviedb.org/3'

const ALLOWED_PREFIXES = ['/movie/', '/tv/', '/person/', '/search/', '/discover/', '/genre/', '/configuration', '/trending/', '/find/']
const BLOCKED_HOSTS = ['169.254.169.254', 'metadata.google.internal', 'cloudmetadata', 'metadata']

const isAllowed = (p: string): boolean => ALLOWED_PREFIXES.some((x) => p === x || p.startsWith(x))

const safeArray = (v: unknown): unknown[] =>
    Array.isArray(v) ? v.filter((i) => i !== null && typeof i === 'object') : []
const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

function sanitizeDetails(d: Record<string, unknown>): Record<string, unknown> {
    const im = obj(d.images)
    const cr = obj(d.credits)
    const vd = obj(d.videos)
    const rd = obj(d.release_dates)
    const cg = obj(d.content_ratings)
    return {
        ...d,
        genres: safeArray(d.genres),
        seasons: safeArray(d.seasons),
        images: {
            logos: safeArray(im.logos),
            backdrops: safeArray(im.backdrops),
            posters: safeArray(im.posters),
        },
        credits: { cast: safeArray(cr.cast) },
        videos: { results: safeArray(vd.results) },
        release_dates: { results: safeArray(rd.results) },
        content_ratings: { results: safeArray(cg.results) },
        known_for: safeArray(d.known_for),
        external_ids: obj(d.external_ids) || undefined,
    }
}

function sanitizePayload(path: string, data: Record<string, unknown>): Record<string, unknown> {
    const p = path.split('?')[0]
    if (/\/person\/\d+\/(movie|tv)_credits$/.test(p)) return { ...data, cast: safeArray(data.cast), crew: safeArray(data.crew) }
    if (/\/person\/\d+$/.test(p)) return { ...data, known_for: safeArray(data.known_for) }
    if (/\/movie\/\d+$|\/tv\/\d+$/.test(p)) return sanitizeDetails(data)
    return { ...data, results: safeArray(data.results), genres: safeArray(data.genres) }
}

serve(async (req) => {
    const url = new URL(req.url)
    if (req.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405 })

    const target = url.searchParams.get('path')
    if (!target || !target.startsWith('/')) return Response.json({ error: 'invalid_path' }, { status: 400 })
    if (!isAllowed(target) || BLOCKED_HOSTS.includes(url.hostname)) {
        return Response.json({ error: 'path_not_allowed' }, { status: 403 })
    }
    if (!TMDB_API_KEY) return Response.json({ error: 'server_misconfigured' }, { status: 500 })

    const up = new URL(BASE + target)
    up.searchParams.set('api_key', TMDB_API_KEY)

    const resp = await fetch(up)
    if (!resp.ok) {
        return Response.json({ error: `upstream_${resp.status}` }, { status: resp.status < 500 ? 404 : 502 })
    }

    let body: Record<string, unknown>
    try {
        body = await resp.json()
    } catch {
        return Response.json({ error: 'bad_upstream_body' }, { status: 502 })
    }

    return Response.json(sanitizePayload(target, body), {
        headers: {
            'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
    })
})