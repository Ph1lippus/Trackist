import { useState, useEffect, useCallback } from 'react'
import { 
    checkRateLimit, 
    recordAttempt, 
    resetRateLimit, 
    formatRetryTime,
    getRateLimitConfig,
    type RateLimitState 
} from '../utils/rateLimit'

export type AuthAction = 'login' | 'register' | 'passwordReset' | 'mfa'

interface UseAuthRateLimitReturn {
    allowed: boolean
    state: RateLimitState | null
    retryAfter: number
    retryAfterFormatted: string
    recordAttempt: () => void
    reset: () => void
    isChecking: boolean
}

export function useAuthRateLimit(action: AuthAction): UseAuthRateLimitReturn {
    const [state, setState] = useState<RateLimitState | null>(null)
    const [retryAfter, setRetryAfter] = useState(0)
    const [allowed, setAllowed] = useState(true)
    const [isChecking, setIsChecking] = useState(true)

    const check = useCallback(() => {
        const result = checkRateLimit(action)
        setAllowed(result.allowed)
        setState(result.state)
        setRetryAfter(result.retryAfter)
        setIsChecking(false)
    }, [action])

    useEffect(() => {
        check()
    }, [check])

    useEffect(() => {
        if (retryAfter > 0) {
            const interval = setInterval(() => {
                const result = checkRateLimit(action)
                setRetryAfter(result.retryAfter)
                setAllowed(result.allowed)
                setState(result.state)
                
                if (result.retryAfter <= 0) {
                    clearInterval(interval)
                }
            }, 1000)
            
            return () => clearInterval(interval)
        }
    }, [retryAfter, action])

    const handleRecordAttempt = useCallback(() => {
        const newState = recordAttempt(action)
        setState(newState)
        setAllowed(!newState.blocked)
        if (newState.blocked) {
            setRetryAfter(newState.resetTime - Date.now())
        }
    }, [action])

    const handleReset = useCallback(() => {
        resetRateLimit(action)
        setState(null)
        setRetryAfter(0)
        setAllowed(true)
    }, [action])

    return {
        allowed,
        state,
        retryAfter,
        retryAfterFormatted: formatRetryTime(retryAfter),
        recordAttempt: handleRecordAttempt,
        reset: handleReset,
        isChecking
    }
}

export function useRateLimitDisplay(action: AuthAction) {
    const { state, retryAfterFormatted, allowed } = useAuthRateLimit(action)
    const config = getRateLimitConfig(action)
    
    if (!config || !state) return null
    
    const remaining = Math.max(0, config.maxAttempts - state.attempts)
    const isBlocked = state.blocked
    
    return {
        remaining,
        maxAttempts: config.maxAttempts,
        isBlocked,
        retryAfterFormatted,
        allowed,
        windowMinutes: Math.round(config.windowMs / 60000)
    }
}