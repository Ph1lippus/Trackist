import { createContext } from 'react'
import type { UseUnifiedSearchReturn } from '../hooks/useUnifiedSearch'

/**
 * The raw React context object for the unified search engine.
 * Kept in a separate file so that SearchContext.tsx (which exports the
 * SearchProvider component) satisfies React Fast Refresh rules.
 */
export const SearchContext = createContext<UseUnifiedSearchReturn | undefined>(undefined)