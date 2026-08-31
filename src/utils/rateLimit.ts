export interface RateLimitConfig {
    maxAttempts: number
    windowMs: number
    keyPrefix: string
}

export interface RateLimitState {
    attempts: number
    resetTime: number
    blocked: boolean
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
    login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:ratelimit:login' },
    register: { maxAttempts: 3, windowMs: 60 * 60 * 1000, keyPrefix: 'auth:ratelimit:register' },
    passwordReset: { maxAttempts: 2, windowMs: 60 * 60 * 1000, keyPrefix: 'auth:ratelimit:passwordReset' },
    mfa: { maxAttempts: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:ratelimit:mfa' }
}

function getFingerprint(): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
        ctx.textBaseline = 'top'
        ctx.font = '14px Arial'
        ctx.fillText('fingerprint', 2, 2)
    }
    const canvasFp = canvas.toDataURL()
    const nav = navigator.userAgent
    const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const lang = navigator.language
    
    let hash = 0
    const str = canvasFp + nav + screen + timezone + lang
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    
    return Math.abs(hash).toString(36)
}

function getStorageKey(action: string, fingerprint: string): string {
    const config = DEFAULT_CONFIGS[action]
    return `${config.keyPrefix}:${fingerprint}`
}

export function getRateLimitState(action: string): RateLimitState | null {
    try {
        const fingerprint = getFingerprint()
        const key = getStorageKey(action, fingerprint)
        const stored = localStorage.getItem(key)
        
        if (!stored) return null
        
        const state: RateLimitState = JSON.parse(stored)
        const now = Date.now()
        
        if (now >= state.resetTime) {
            localStorage.removeItem(key)
            return null
        }
        
        return state
    } catch {
        return null
    }
}

export function setRateLimitState(action: string, state: RateLimitState): void {
    try {
        const fingerprint = getFingerprint()
        const key = getStorageKey(action, fingerprint)
        localStorage.setItem(key, JSON.stringify(state))
    } catch {
    }
}

export function checkRateLimit(action: string): { allowed: boolean; state: RateLimitState | null; retryAfter: number } {
    const config = DEFAULT_CONFIGS[action]
    if (!config) return { allowed: true, state: null, retryAfter: 0 }
    
    const now = Date.now()
    let state = getRateLimitState(action)
    
    if (!state || now >= state.resetTime) {
        state = {
            attempts: 0,
            resetTime: now + config.windowMs,
            blocked: false
        }
    }
    
    if (state.blocked && now < state.resetTime) {
        return { allowed: false, state, retryAfter: state.resetTime - now }
    }
    
    if (state.attempts >= config.maxAttempts) {
        state.blocked = true
        setRateLimitState(action, state)
        return { allowed: false, state, retryAfter: state.resetTime - now }
    }
    
    return { allowed: true, state, retryAfter: 0 }
}

export function recordAttempt(action: string): RateLimitState {
    const config = DEFAULT_CONFIGS[action]
    if (!config) return { attempts: 0, resetTime: 0, blocked: false }
    
    const now = Date.now()
    let state = getRateLimitState(action)
    
    if (!state || now >= state.resetTime) {
        state = {
            attempts: 0,
            resetTime: now + config.windowMs,
            blocked: false
        }
    }
    
    state.attempts += 1
    
    if (state.attempts >= config.maxAttempts) {
        state.blocked = true
    }
    
    setRateLimitState(action, state)
    return state
}

export function resetRateLimit(action: string): void {
    try {
        const fingerprint = getFingerprint()
        const key = getStorageKey(action, fingerprint)
        localStorage.removeItem(key)
    } catch {
    }
}

export function formatRetryTime(ms: number): string {
    if (ms < 60000) {
        return `${Math.ceil(ms / 1000)}s`
    }
    const minutes = Math.ceil(ms / 60000)
    if (minutes < 60) {
        return `${minutes}m`
    }
    const hours = Math.ceil(ms / 3600000)
    return `${hours}h`
}

export function getRateLimitConfig(action: string): RateLimitConfig | undefined {
    return DEFAULT_CONFIGS[action]
}