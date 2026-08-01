/**
 * Lightweight fuzzy matching utility inspired by Meilisearch typo-tolerance rules.
 *
 * Meilisearch classifies typos by word length:
 *   - 1-4 char words: tolerate 1 typo
 *   - 5+ char words: tolerate 2 typos
 *
 * We approximate this with a Damerau-Levenshtein distance (transposition-aware)
 * and a prefix-bonus scoring strategy so that "incept" still matches "Inception".
 */

/**
 * Damerau-Levenshtein distance between two strings.
 * Counts insertions, deletions, substitutions, and adjacent transpositions.
 */
export function damerauLevenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (!a.length) return b.length
    if (!b.length) return a.length

    const aLen = a.length
    const bLen = b.length

    // Two rows of the DP matrix + a map of the last seen position of each char in a
    let prevPrev = new Array<number>(bLen + 1).fill(0)
    let prev = new Array<number>(bLen + 1).fill(0)
    let curr = new Array<number>(bLen + 1).fill(0)

    for (let j = 0; j <= bLen; j++) prev[j] = j

    const lastSeen = new Map<string, number>()

    for (let i = 1; i <= aLen; i++) {
        curr[0] = i
        const aChar = a[i - 1]
        let lastMatch = 0

        for (let j = 1; j <= bLen; j++) {
            const bChar = b[j - 1]
            const cost = aChar === bChar ? 0 : 1
            const del = curr[j - 1] + 1
            const ins = prev[j] + 1
            const sub = prev[j - 1] + cost

            let val = Math.min(del, ins, sub)

            // Transposition check
            if (
                i > 1 &&
                j > 1 &&
                aChar === b[j - 2] &&
                a[i - 2] === bChar
            ) {
                val = Math.min(val, prevPrev[j - 2] + 1)
            }

            // Restriction: only consider transpositions when the previous a-char
            // was last seen at the position before the current b-char.
            const lastPos = lastSeen.get(bChar) ?? 0
            if (lastPos > 0 && lastMatch > 0) {
                // (handled by the explicit transposition check above)
            }

            curr[j] = val
            if (cost === 0) lastMatch = j
        }

        lastSeen.set(aChar, i)

        // Rotate rows
        const tmp = prevPrev
        prevPrev = prev
        prev = curr
        curr = tmp
    }

    return prev[bLen]
}

/**
 * Maximum tolerated typos for a given query word length, following
 * Meilisearch's default rules.
 */
export function maxTyposForWord(word: string): number {
    const len = word.length
    if (len <= 4) return 1
    return 2
}

/**
 * Score a candidate string against a query.
 * Returns a number in [0, 1] where 1 is a perfect match.
 * Combines prefix bonus + typo tolerance.
 */
export function fuzzyScore(query: string, candidate: string): number {
    if (!query || !candidate) return 0

    const q = query.toLowerCase().trim()
    const c = candidate.toLowerCase().trim()

    if (!q || !c) return 0

    // Exact match is the best possible score
    if (q === c) return 1

    // Prefix match gets a strong bonus
    if (c.startsWith(q)) return 0.95

    // Token-based matching: every query token must match some candidate token
    // within its typo budget, otherwise the score is heavily penalized.
    const qTokens = q.split(/\s+/).filter(Boolean)
    const cTokens = c.split(/\s+/).filter(Boolean)

    let totalScore = 0
    let matchedTokens = 0

    for (const qTok of qTokens) {
        let bestTokScore = 0
        for (const cTok of cTokens) {
            const dist = damerauLevenshtein(qTok, cTok)
            const budget = maxTyposForWord(qTok)
            if (dist > budget) continue

            // Score: closer distance + prefix bonus
            const distScore = 1 - dist / Math.max(qTok.length, cTok.length)
            const prefixBonus = cTok.startsWith(qTok) ? 0.15 : 0
            const tokScore = Math.min(1, distScore + prefixBonus)
            if (tokScore > bestTokScore) bestTokScore = tokScore
        }

        if (bestTokScore > 0) matchedTokens++
        totalScore += bestTokScore
    }

    // If not all tokens matched, scale down
    const tokenCoverage = qTokens.length ? matchedTokens / qTokens.length : 0
    const avgScore = qTokens.length ? totalScore / qTokens.length : 0

    // Substring containment as a fallback signal
    const contains = c.includes(q) ? 0.3 : 0

    return Math.max(avgScore * tokenCoverage, contains)
}

/**
 * Filter and sort a list of items by fuzzy relevance to the query.
 * Each item is scored via the provided `getText` accessor.
 * Items scoring 0 are excluded.
 */
export function fuzzyFilter<T>(
    query: string,
    items: T[],
    getText: (item: T) => string,
    minScore = 0.3
): Array<{ item: T; score: number }> {
    if (!query.trim()) return items.map(item => ({ item, score: 1 }))

    const scored = items
        .map(item => {
            const text = getText(item)
            const score = fuzzyScore(query, text)
            return { item, score }
        })
        .filter(({ score }) => score >= minScore)

    scored.sort((a, b) => b.score - a.score)
    return scored
}