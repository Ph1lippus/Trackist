import { useContext } from 'react'
import { SearchContext } from '../contexts/SearchContext'
import type { UseUnifiedSearchReturn } from './useUnifiedSearch'

/**
 * Consume the unified search engine from any component inside SearchProvider.
 */
export function useSearch(): UseUnifiedSearchReturn {
    const context = useContext(SearchContext)
    if (!context) {
        throw new Error('useSearch must be used within SearchProvider')
    }
    return context
}