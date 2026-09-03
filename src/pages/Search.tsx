import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import useDetailModalStore from '../stores/detailModalStore'
import { getResultImageUrl } from '../services/searchService'
import type { BaseSearchResult, SearchResultsByKind } from '../types/search'

const SECTION_LABELS: Record<keyof SearchResultsByKind, string> = {
    movies: 'Movies',
    tv: 'TV Shows',
    people: 'People',
    users: 'Users',
    lists: 'Lists',
}

type FilterTab = 'all' | 'movies' | 'tv' | 'people' | 'users'

const TABS: Array<{ value: FilterTab; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'movies', label: 'Movies' },
    { value: 'tv', label: 'TV Shows' },
    { value: 'people', label: 'People' },
    { value: 'users', label: 'Users' },
]

const Search: React.FC = () => {
    const navigate = useNavigate()
    usePageTitle('Search')
    const [activeTab, setActiveTab] = useState<FilterTab>('all')
    const {
        groupedResults,
        isLoading,
        query,
        belowMinChars,
        error,
        inputValue,
    } = useSearch()

    const handleClickResult = (result: BaseSearchResult) => {
        switch (result.kind) {
            case 'movie':
                useDetailModalStore.getState().open('movie', Number(result.id))
                break
            case 'tv':
                useDetailModalStore.getState().open('tv', Number(result.id))
                break
            case 'person':
                useDetailModalStore.getState().open('person', Number(result.id))
                break
            case 'user':
                navigate(`/Profile/${result.title}`)
                break
            case 'list':
                navigate(`/Lists/${result.id}`)
                break
        }
    }

    // Sections shown based on the active filter tab
    const visibleSections: Array<keyof SearchResultsByKind> =
        activeTab === 'all'
            ? ['movies', 'tv', 'people', 'users']
            : activeTab === 'movies'
                ? ['movies']
                : activeTab === 'tv'
                    ? ['tv']
                    : activeTab === 'people'
                        ? ['people']
                        : ['users']

    const hasResults = visibleSections.some((s) => groupedResults[s].length > 0)

    const showMinCharsHint = belowMinChars && !isLoading
    const showNoResults = !isLoading && !hasResults && !showMinCharsHint && query.length >= 3
    const showEmpty = !isLoading && !hasResults && !inputValue && !belowMinChars

    return (
        <section className="dashboard-page search-page">
            <div className="dashboard-shell search-shell">
                <div className="search-page__toolbar">
                    <div className="search-page__tabs" role="tablist" aria-label="Search filter">
                        {TABS.map((tab) => (
                            <button
                                key={tab.value}
                                role="tab"
                                aria-selected={activeTab === tab.value}
                                className={`search-page__tab${activeTab === tab.value ? ' active' : ''}`}
                                onClick={() => setActiveTab(tab.value)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="search-page__body">
                    {isLoading && !hasResults && (
                        <div className="search-page__state">
                            <div className="discover-spinner" />
                            <p>Searching…</p>
                        </div>  
                    )}

                    {showMinCharsHint && (
                        <div className="search-page__state">
                            <p>Type at least 3 characters to search</p>
                        </div>
                    )}

                    {showEmpty && !isLoading && (
                        <div className="search-page__state">
                        </div>
                    )}

                    {error && !isLoading && (
                        <div className="search-page__state search-page__state--error">
                            <p>{error}</p>
                        </div>
                    )}

                    {showNoResults && !error && (
                        <div className="search-page__state">
                            <p>No results for "{query}"</p>
                        </div>
                    )}

                    {hasResults && (
                        <div className="search-page__results">
                            {visibleSections.map((section) => {
                                const sectionResults = groupedResults[section]
                                if (!sectionResults.length) return null
                                return (
                                    <div key={section} className="search-page__section">
                                        <div className="search-page__section-header">
                                            <span>{SECTION_LABELS[section]}</span>
                                            <span className="search-page__section-count">
                                                {sectionResults.length}
                                            </span>
                                        </div>
                                        <div className="search-page__items">
                                            {sectionResults
                                                .map((result) => ({ result, img: getResultImageUrl(result) }))
                                                .sort((a, b) => Number(!a.img) - Number(!b.img))
                                                .map(({ result }) => (
                                                    <SearchResultRow
                                                        key={`${result.kind}-${result.id}`}
                                                        result={result}
                                                        onClick={() => handleClickResult(result)}
                                                    />
                                                ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

const SearchResultRow: React.FC<{
    result: BaseSearchResult
    onClick: () => void
}> = ({ result, onClick }) => {
    const imgUrl = getResultImageUrl(result)

    return (
        <button className={`search-page__item${imgUrl ? '' : ' search-page__item--no-poster'}`} onClick={onClick} role="option">
            {imgUrl && (
                <div className={`search-page__poster ${result.kind === 'person' || result.kind === 'user' ? 'search-page__poster--circle' : ''}`}>
                    <img src={imgUrl} alt={result.title} loading="lazy" />
                </div>
            )}
            <div className="search-page__info">
                <span className="search-page__title">{result.title}</span>
                {result.subtitle && (
                    <span className="search-page__subtitle">{result.subtitle}</span>
                )}
            </div>
            {result.kind === 'user' && result.userRecord?.is_following && (
                <span className="search-page__badge search-page__badge--following">Following</span>
            )}
            {result.kind === 'list' && (
                <span className={`search-page__badge ${result.listRecord?.is_public ? 'search-page__badge--public' : 'search-page__badge--private'}`}>
                    {result.listRecord?.is_public ? 'Public' : 'Private'}
                </span>
            )}
        </button>
    )
}

export default Search
