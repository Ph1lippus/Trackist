import React, { useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getResultImageUrl } from '../../services/searchService'
import type { BaseSearchResult, SearchContextType, SearchResultsByKind } from '../../types/search'

interface SearchDropdownProps {
    isOpen: boolean
    isLoading: boolean
    results: BaseSearchResult[]
    groupedResults: SearchResultsByKind
    context: SearchContextType
    query: string
    belowMinChars: boolean
    error: string | null
    onClose: () => void
    onCommit: () => void
}

const SECTION_LABELS: Record<keyof SearchResultsByKind, string> = {
    movies: 'Movies',
    tv: 'TV Shows',
    people: 'People',
    users: 'Users',
    lists: 'Lists',
}

const SECTION_ICONS: Record<keyof SearchResultsByKind, string> = {
    movies: 'fa-film',
    tv: 'fa-tv',
    people: 'fa-user',
    users: 'fa-users',
    lists: 'fa-list-ul',
}

/**
 * Context-aware predictive search dropdown.
 *
 * The layout adapts to the active page context:
 *  - discover: sectioned (Movies / TV / People / Lists)
 *  - movies: single Movies section
 *  - tvshows: single TV Shows section
 *  - finished: Movies + TV sections
 *  - friends: single Users section
 *  - lists: single Lists section
 */
const SearchDropdown: React.FC<SearchDropdownProps> = ({
    isOpen,
    isLoading,
    results,
    groupedResults,
    context,
    query,
    belowMinChars,
    error,
    onClose,
    onCommit,
}) => {
    const navigate = useNavigate()
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, onClose])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    // Determine which sections to show based on context
    const visibleSections = useMemo<Array<keyof SearchResultsByKind>>(() => {
        switch (context) {
            case 'discover':
                return ['movies', 'tv', 'people', 'lists']
            case 'movies':
                return ['movies']
            case 'tvshows':
                return ['tv']
            case 'finished':
                return ['movies', 'tv']
            case 'friends':
                return ['users']
            case 'lists':
                return ['lists']
            default:
                return ['movies', 'tv', 'people', 'lists']
        }
    }, [context])

    const handleResultClick = (result: BaseSearchResult) => {
        switch (result.kind) {
            case 'movie':
                navigate(`/movie/${result.id}`)
                break
            case 'tv':
                navigate(`/tv/${result.id}`)
                break
            case 'person':
                navigate(`/person/${result.id}`)
                break
            case 'user':
                navigate(`/Profile/${result.title}`)
                break
            case 'list':
                navigate(`/Lists/${result.id}`)
                break
        }
        onClose()
    }

    if (!isOpen) return null

    const hasResults = results.length > 0
    const showMinCharsHint = belowMinChars && !isLoading
    const showNoResults = !isLoading && !hasResults && !showMinCharsHint && query.length >= 3
    const showLoading = isLoading && !hasResults

    return (
        <div className="search-dropdown" ref={dropdownRef} role="listbox">
            {/* Loading state */}
            {showLoading && (
                <div className="search-dropdown__loading">
                    <div className="discover-spinner" />
                    <p>Searching…</p>
                </div>
            )}

            {/* Min chars hint */}
            {showMinCharsHint && (
                <div className="search-dropdown__hint">
                    <i className="fa-solid fa-keyboard"></i>
                    <p>Type at least 3 characters to search</p>
                </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
                <div className="search-dropdown__error">
                    <i className="fa-solid fa-circle-exclamation"></i>
                    <p>{error}</p>
                </div>
            )}

            {/* No results */}
            {showNoResults && !error && (
                <div className="search-dropdown__empty">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <p>No results for "{query}"</p>
                </div>
            )}

            {/* Results */}
            {hasResults && (
                <div className="search-dropdown__body">
                    {visibleSections.map((section) => {
                        const sectionResults = groupedResults[section]
                        if (!sectionResults.length) return null
                        return (
                            <div key={section} className="search-dropdown__section">
                                <div className="search-dropdown__section-header">
                                    <i className={`fa-solid ${SECTION_ICONS[section]}`}></i>
                                    <span>{SECTION_LABELS[section]}</span>
                                    <span className="search-dropdown__section-count">
                                        {sectionResults.length}
                                    </span>
                                </div>
                                <div className="search-dropdown__items">
                                    {sectionResults.map((result) => (
                                        <SearchResultRow
                                            key={`${result.kind}-${result.id}`}
                                            result={result}
                                            onClick={() => handleResultClick(result)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}

                    {/* Footer with search-all hint */}
                    <div className="search-dropdown__footer">
                        <button
                            className="search-dropdown__footer-btn"
                            onClick={onCommit}
                        >
                            <i className="fa-solid fa-arrow-right"></i>
                            Press Enter for full results
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * Individual search result row with poster/avatar + title + subtitle.
 */
const SearchResultRow: React.FC<{
    result: BaseSearchResult
    onClick: () => void
}> = ({ result, onClick }) => {
    const imgUrl = getResultImageUrl(result)
    const isPerson = result.kind === 'person'
    const isUser = result.kind === 'user'
    const isList = result.kind === 'list'

    return (
        <button
            className="search-dropdown__item"
            onClick={onClick}
            role="option"
            aria-selected="false"
        >
            <div className={`search-dropdown__poster ${isPerson || isUser ? 'search-dropdown__poster--circle' : ''}`}>
                {imgUrl ? (
                    <img src={imgUrl} alt={result.title} loading="lazy" />
                ) : (
                    <div className="search-dropdown__no-poster">
                        {isList ? (
                            <i className="fa-solid fa-list-ul"></i>
                        ) : isPerson || isUser ? (
                            <span>{(result.title || 'U')[0].toUpperCase()}</span>
                        ) : (
                            <i className="fa-solid fa-film"></i>
                        )}
                    </div>
                )}
            </div>
            <div className="search-dropdown__info">
                <span className="search-dropdown__title">{result.title}</span>
                {result.subtitle && (
                    <span className="search-dropdown__subtitle">{result.subtitle}</span>
                )}
            </div>
            {result.kind === 'user' && result.userRecord?.is_following && (
                <span className="search-dropdown__badge search-dropdown__badge--following">
                    Following
                </span>
            )}
            {result.kind === 'list' && (
                <span className={`search-dropdown__badge ${result.listRecord?.is_public ? 'search-dropdown__badge--public' : 'search-dropdown__badge--private'}`}>
                    {result.listRecord?.is_public ? 'Public' : 'Private'}
                </span>
            )}
        </button>
    )
}

export default SearchDropdown