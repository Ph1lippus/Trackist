import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { runSearch } from '../services/searchService'
import { DEFAULT_SEARCH_CONFIG } from '../types/search'
import type {
    BaseSearchResult,
    SearchContextType,
    SearchResultsByKind,
} from '../types/search'
import { groupResultsByKind } from '../services/searchService'

/**
 * Derive the search context from the router location.
 * - /Discover and /  -> discover
 * - /Movies          -> movies
 * - /Tvshows         -> tvshows
 * - /Finished        -> finished
 * - /Lists*          -> lists
 */
export function deriveSearchContext(pathname: string): SearchContextType {
    if (pathname === '/' || pathname === '/Discover') return 'discover'
    if (pathname === '/Movies') return 'movies'
    if (pathname === '/MobileMovies') return 'movies'
    if (pathname === '/Tvshows') return 'tvshows'
    if (pathname === '/MobileTVShows') return 'tvshows'
    if (pathname === '/Finished') return 'finished'
    if (pathname.startsWith('/Lists')) return 'lists'
    // Default to discover for unknown authenticated pages
    return 'discover'
}

export interface UseUnifiedSearchReturn {
    /** Current input value (controlled) */
    inputValue: string
    setInputValue: (value: string) => void
    /** The committed query that passed debounce + min-char checks */
    query: string
    /** Active page context */
    context: SearchContextType
    /** Whether a search request is in-flight */
    isLoading: boolean
    /** Flat list of results */
    results: BaseSearchResult[]
    /** Results grouped by kind for sectioned dropdowns */
    groupedResults: SearchResultsByKind
    /** Error message, if any */
    error: string | null
    /** True when the input is below the min-character limit */
    belowMinChars: boolean
    /** Whether the dropdown should be visible */
    isDropdownOpen: boolean
    /** Close the dropdown */
    closeDropdown: () => void
    /** Clear the search entirely */
    clear: () => void
    /** The committed query that pages can use for full-page filtering */
    committedQuery: string
    /** Commit the current input as the page-level query (Enter / submit) */
    commitQuery: () => void
}

/**
 * Unified, predictive real-time search hook.
 *
 * Core mechanics (all pages):
 *  - Debouncer strictly set to 250ms
 *  - Min-character limit: no real-time execution until length >= 3
 *  - Network cleanup: a new AbortController is instantiated on each new
 *    keystroke, cancelling any unresolved pending request immediately.
 */
export function useUnifiedSearch(): UseUnifiedSearchReturn {
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const context = deriveSearchContext(location.pathname)
    const isSearchPage = location.pathname === '/Search'

    const [inputValue, setInputValue] = useState('')
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [results, setResults] = useState<BaseSearchResult[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [committedQuery, setCommittedQuery] = useState('')
    const previousPathname = useRef(location.pathname)

    // Refs for cleanup
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const abortController = useRef<AbortController | null>(null)
    const currentRequestId = useRef(0)

    // Track the previous context in state so we can detect changes and reset.
    // React supports adjusting state during render when it's conditional on
    // changed props/state (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
    const [prevContext, setPrevContext] = useState<SearchContextType>(context)
    if (prevContext !== context) {
        setPrevContext(context)
        setInputValue('')
        setQuery('')
        setResults([])
        setError(null)
        setIsDropdownOpen(false)
        setCommittedQuery('')
    }

    const seededSearchContextRef = useRef<SearchContextType | null>(null)

    // Side-effect cleanup when the page context changes (cancel in-flight requests)
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current)
                debounceTimer.current = null
            }
            if (abortController.current) {
                abortController.current.abort()
                abortController.current = null
            }
        }
    }, [context])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
            if (abortController.current) abortController.current.abort()
        }
    }, [])

    const executeSearch = useCallback(
        async (searchQuery: string, searchContext: SearchContextType) => {
            // Cancel any previous in-flight request
            if (abortController.current) {
                abortController.current.abort()
            }

            const controller = new AbortController()
            abortController.current = controller
            const requestId = ++currentRequestId.current

            setIsLoading(true)
            setError(null)

            try {
                const data = await runSearch(
                    searchQuery,
                    searchContext,
                    controller.signal,
                    DEFAULT_SEARCH_CONFIG.maxPerKind
                )

                // Ignore stale responses
                if (requestId !== currentRequestId.current || controller.signal.aborted) {
                    return
                }

                setResults(data)
                setIsDropdownOpen(data.length > 0)
            } catch (err) {
                if (controller.signal.aborted) return
                if (err instanceof DOMException && err.name === 'AbortError') return
                const message = err instanceof Error ? err.message : 'Search failed'
                if (requestId !== currentRequestId.current) return
                setError(message)
                setResults([])
            } finally {
                if (requestId === currentRequestId.current && !controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        },
        []
    )

    // Seed the /Search page from a shared/reloaded ?q= URL param so search
    // links open straight to results instead of a blank page. Guarded per
    // context so typing-driven URL changes don't re-seed and re-run search.
    useEffect(() => {
        if (!isSearchPage) return
        if (seededSearchContextRef.current === context) return
        seededSearchContextRef.current = context
        const urlQuery = new URLSearchParams(searchParams).get('q')?.trim() ?? ''
        if (!urlQuery) return
        // Seeding state from an externally-provided URL (shared link / reload)
        // is a legitimate one-time external-system sync, not cascading.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInputValue(urlQuery)
        setQuery(urlQuery)
        setCommittedQuery(urlQuery)
        void executeSearch(urlQuery, context)
    }, [isSearchPage, searchParams, context, executeSearch])

    // Debounced input handler — 250ms strict, min 3 chars
    const setInputValueDebounced = useCallback(
        (value: string) => {
            setInputValue(value)

            // Clear any pending debounce
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current)
                debounceTimer.current = null
            }

            // Cancel any in-flight request immediately on new keystroke
            if (abortController.current) {
                abortController.current.abort()
                abortController.current = null
                currentRequestId.current++
                setIsLoading(false)
            }

            const trimmed = value.trim()

            // Min-character limit: do not trigger real-time execution below 3 chars
            if (trimmed.length < DEFAULT_SEARCH_CONFIG.minChars) {
                setQuery('')
                setResults([])
                setIsDropdownOpen(false)
                if (isSearchPage && searchParams.has('q')) {
                    const next = new URLSearchParams(searchParams)
                    next.delete('q')
                    setSearchParams(next, { replace: true })
                }
                return
            }

            // Debounce 250ms
            debounceTimer.current = setTimeout(() => {
                setQuery(trimmed)
                // Reflect the executed query in the URL so real-time results are
                // shareable / survive a reload, without spamming history.
                if (isSearchPage) {
                    const next = new URLSearchParams(searchParams)
                    if (next.get('q') !== trimmed) {
                        next.set('q', trimmed)
                        setSearchParams(next, { replace: true })
                    }
                }
                void executeSearch(trimmed, context)
            }, DEFAULT_SEARCH_CONFIG.debounceMs)
        },
        [context, executeSearch, isSearchPage, searchParams, setSearchParams]
    )

    const clear = useCallback(() => {
        setInputValue('')
        setQuery('')
        setResults([])
        setError(null)
        setIsDropdownOpen(false)
        setCommittedQuery('')
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
            debounceTimer.current = null
        }
        if (abortController.current) {
            abortController.current.abort()
            abortController.current = null
        }
        if (isSearchPage && searchParams.has('q')) {
            const next = new URLSearchParams(searchParams)
            next.delete('q')
            setSearchParams(next, { replace: true })
        }
    }, [isSearchPage, searchParams, setSearchParams])

    // Search is a separate native screen, so returning to Discover must start
    // with Discover's unfiltered state rather than restoring the search term.
    useEffect(() => {
        const leftSearchPage = previousPathname.current === '/Search' && location.pathname !== '/Search'
        previousPathname.current = location.pathname
        if (leftSearchPage) clear()
    }, [location.pathname, clear])

    const closeDropdown = useCallback(() => {
        setIsDropdownOpen(false)
    }, [])

    const commitQuery = useCallback(() => {
        const trimmed = inputValue.trim()
        setCommittedQuery(trimmed)
        setIsDropdownOpen(false)
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
            debounceTimer.current = null
        }
        if (abortController.current) {
            abortController.current.abort()
            abortController.current = null
            currentRequestId.current++
            setIsLoading(false)
        }
        // Reflect the committed query in the URL so search is shareable and
        // survives a reload on the /Search page.
        if (isSearchPage) {
            const next = new URLSearchParams(searchParams)
            if (trimmed) {
                next.set('q', trimmed)
            } else {
                next.delete('q')
            }
            setSearchParams(next, { replace: true })
        }
    }, [inputValue, isSearchPage, searchParams, setSearchParams])

    const groupedResults = groupResultsByKind(results)

    const belowMinChars =
        inputValue.trim().length > 0 && inputValue.trim().length < DEFAULT_SEARCH_CONFIG.minChars

    return {
        inputValue,
        setInputValue: setInputValueDebounced,
        query,
        context,
        isLoading,
        results,
        groupedResults,
        error,
        belowMinChars,
        isDropdownOpen,
        closeDropdown,
        clear,
        committedQuery,
        commitQuery,
    }
}