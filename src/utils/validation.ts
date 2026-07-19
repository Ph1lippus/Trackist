// Username validation - only allow alphanumeric, underscores, hyphens
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/
const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_LENGTH = 20

export const validateUsername = (username: string): string | null => {
    const cleaned = username.trim()
    
    if (!cleaned) {
        return 'Username is required'
    }
    
    if (cleaned.length < USERNAME_MIN_LENGTH) {
        return `Username must be at least ${USERNAME_MIN_LENGTH} characters`
    }
    
    if (cleaned.length > USERNAME_MAX_LENGTH) {
        return `Username must be at most ${USERNAME_MAX_LENGTH} characters`
    }
    
    if (!USERNAME_REGEX.test(cleaned)) {
        return 'Username can only contain letters, numbers, underscores, and hyphens'
    }
    
    return null
}

// Email validation
export const validateEmail = (email: string): string | null => {
    const cleaned = email.trim().toLowerCase()
    
    if (!cleaned) {
        return 'Email is required'
    }
    
    // Basic email regex pattern
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(cleaned)) {
        return 'Please enter a valid email address'
    }
    
    return null
}

// Password validation
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

export const validatePassword = (password: string): string | null => {
    if (!password) {
        return 'Password is required'
    }
    
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    }
    
    if (password.length > PASSWORD_MAX_LENGTH) {
        return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
    }
    
    return null
}

// Display name validation (used in profile edit - allows spaces and common characters)
const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_' .-]+$/
const DISPLAY_NAME_MIN_LENGTH = 1
const DISPLAY_NAME_MAX_LENGTH = 50

export const validateDisplayName = (displayName: string): string | null => {
    const cleaned = displayName.trim()
    
    if (!cleaned) {
        return 'Display name is required'
    }
    
    if (cleaned.length < DISPLAY_NAME_MIN_LENGTH) {
        return 'Display name cannot be empty'
    }
    
    if (cleaned.length > DISPLAY_NAME_MAX_LENGTH) {
        return `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`
    }
    
    if (!DISPLAY_NAME_REGEX.test(cleaned)) {
        return 'Display name contains invalid characters'
    }
    
    return null
}

// Avatar URL validation
export const validateAvatarUrl = (url: string | null): string | null => {
    if (!url) return null // Avatar URL is optional
    
    const cleaned = url.trim()
    if (!cleaned) return null
    
    try {
        const parsed = new URL(cleaned)
        if (!parsed.protocol.startsWith('http')) {
            return 'Avatar URL must start with http:// or https://'
        }
    } catch {
        return 'Please enter a valid URL'
    }
    
    return null
}