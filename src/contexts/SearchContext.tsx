import React, { createContext, useContext, useState, useCallback } from 'react'

interface SearchContextType {
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchInputValue: string
  setSearchInputValue: (query: string) => void
  clearSearch: () => void
}

export const SearchContext = createContext<SearchContextType | undefined>(undefined)

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchInputValue, setSearchInputValue] = useState('')

    const clearSearch = useCallback(() => {
        setSearchQuery('')
        setSearchInputValue('')
    }, [])

    return (
        <SearchContext.Provider value={{ searchQuery, setSearchQuery, searchInputValue, setSearchInputValue, clearSearch }}>
            {children}
        </SearchContext.Provider>
    )
}

export const useSearch = () => {
  const context = useContext(SearchContext)
  if (!context) {
    throw new Error('useSearch must be used within SearchProvider')
  }
  return context
}