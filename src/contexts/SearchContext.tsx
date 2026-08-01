import React, { createContext } from 'react'
import { useUnifiedSearch } from '../hooks/useUnifiedSearch'
import type { UseUnifiedSearchReturn } from '../hooks/useUnifiedSearch'

export const SearchContext = createContext<UseUnifiedSearchReturn | undefined>(undefined)

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const search = useUnifiedSearch()

    return (
        <SearchContext.Provider value={search}>
            {children}
        </SearchContext.Provider>
    )
}