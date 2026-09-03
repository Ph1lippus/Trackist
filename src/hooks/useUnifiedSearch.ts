import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
    const context = deriveSearchContext(location.pathname)

    const [inputValue, setInputValue] = useState('')
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [results, setResults] = useState<BaseSearchResult[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [committedQuery, setCommittedQuery] = useState('')

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
                return
            }

            // Debounce 250ms
            debounceTimer.current = setTimeout(() => {
                setQuery(trimmed)
                void executeSearch(trimmed, context)
            }, DEFAULT_SEARCH_CONFIG.debounceMs)
        },
        [context, executeSearch]
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
    }, [])

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
    }, [inputValue])

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