/**
 * UTC-safe date utilities for consistent cross-timezone behavior.
 * 
 * All dates from the API are YYYY-MM-DD strings (no time component).
 * These utilities ensure consistent interpretation regardless of client timezone.
 */

/**
 * Get today's date as a YYYY-MM-DD string in UTC.
 * This is the canonical "today" value used throughout the app.
 * 
 * @example
 * // Returns "2024-01-15" regardless of client timezone
 * const today = getUTCTodayString()
 */
export function getUTCTodayString(): string {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Convert a YYYY-MM-DD date string to a UTC date string.
 * Since the input has no time component, we treat it as already being in UTC.
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns The same date string (normalized)
 */
export function normalizeDateString(dateString: string): string {
    // Input is already YYYY-MM-DD, just validate and return
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString
    }
    return dateString
}

/**
 * Get the year and month from a YYYY-MM-DD string.
 * Returns numbers suitable for Date constructor or comparison.
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Object with year and month (0-indexed)
 */
export function getYearMonth(dateString: string): { year: number; month: number } {
    const [year, month] = dateString.split('-').map(Number)
    return { year, month: month - 1 } // month is 0-indexed for Date constructor
}

/**
 * Extract the date part (YYYY-MM-DD) from an ISO datetime string.
 * 
 * @param isoString - ISO datetime string (e.g., "2024-01-15T10:30:00.000Z")
 * @returns Date part as YYYY-MM-DD
 */
export function getDateFromISO(isoString: string): string {
    return isoString.split('T')[0]
}

/**
 * Check if a date string is today (UTC).
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is today
 */
export function isToday(dateString: string): boolean {
    return dateString === getUTCTodayString()
}

/**
 * Check if a date string is in the past (before today UTC).
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is before today
 */
export function isPastDate(dateString: string): boolean {
    return dateString < getUTCTodayString()
}

/**
 * Check if a date string is in the future (after today UTC).
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is after today
 */
export function isFutureDate(dateString: string): boolean {
    return dateString > getUTCTodayString()
}

/**
 * Format a YYYY-MM-DD date string for display.
 * Uses UTC methods to avoid timezone shifts.
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDateString(dateString: string, options?: Intl.DateTimeFormatOptions): string {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString
    }
    
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    
    return date.toLocaleDateString('en-US', options || {})
}

/**
 * Get the cache date from a timestamp.
 * Returns YYYY-MM-DD string representing the UTC date when the cache was created.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Date string in YYYY-MM-DD format
 */
export function getCacheDate(timestamp: number): string {
    const date = new Date(timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Check if cache needs revalidation based on date change.
 * Returns true if the cache was created on a different calendar day (UTC).
 * 
 * @param lastFetchedTimestamp - Timestamp when data was last fetched
 * @returns true if cache should be revalidated
 */
export function shouldRevalidateByDate(lastFetchedTimestamp: number | null): boolean {
    if (!lastFetchedTimestamp) return true
    
    const cacheDate = getCacheDate(lastFetchedTimestamp)
    const today = getUTCTodayString()
    
    return cacheDate !== today
}