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

// Password validation constants
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128

// Common passwords blocklist (top 1000 most common - subset for bundle size)
const COMMON_PASSWORDS = new Set([
    'password', '123456', '123456789', '12345678', '12345', '1234567', '1234567890',
    'qwerty', 'abc123', 'password1', 'admin', 'letmein', 'welcome', 'monkey',
    'dragon', 'sunshine', 'master', 'hello', 'football', 'iloveyou', 'superman',
    'batman', 'trustno1', '654321', 'qwertyuiop', '123123', 'baseball', 'mustang',
    'shadow', 'ashley', 'bailey', 'passw0rd', 'jordan', 'andrew', 'michael',
    'charlie', 'maggie', 'ginger', 'hunter', 'buster', 'soccer', 'harley',
    'thomas', 'tigger', 'robert', 'daniel', 'george', 'jessica', 'mickey',
    'jennifer', 'cookie', 'michelle', 'katie', 'lindsay', 'sophie', 'amanda',
    'orange', 'biteme', 'matrix', 'pepper', 'nicole', 'heather', 'melissa',
    'anthony', 'christopher', 'danielle', 'steven', 'zxcvbn', 'liverpool',
    'joshua', 'maggie', 'andrea', 'amanda', 'megan', 'hannah', 'zachary',
    'nathan', 'angela', 'rachel', 'laura', 'emma', 'kelly', 'victoria',
    'christina', 'catherine', 'samantha', 'nicole', 'elizabeth', 'brittany',
    'alexandra', 'alyssa', 'megan', 'haley', 'kayla', 'sydney', 'katherine',
    'maria', 'marie', 'anna', 'karen', 'julia', 'ruth', 'kimberly', 'diana',
    'deborah', 'heather', 'diane', 'joyce', 'carol', 'virginia', 'maria',
    'janet', 'catherine', 'frances', 'ann', 'jean', 'alice', 'susan', 'margaret',
    'rose', 'dorothy', 'lisa', 'nancy', 'betty', 'helen', 'sandra', 'donna',
    'sharon', 'laura', 'cynthia', 'kathleen', 'amanda', 'melissa', 'debra',
    'stephanie', 'rebecca', 'laura', 'sharon', 'cynthia', 'kathleen', 'amanda',
    'angel', 'brandon', 'justin', 'ryan', 'christian', 'sean', 'kevin', 'brian',
    'joseph', 'john', 'david', 'matthew', 'anthony', 'mark', 'donald', 'steven',
    'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'edward',
    'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas',
    'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin',
    'samuel', 'gregory', 'alexander', 'frank', 'raymond', 'patrick', 'jack', 'dennis'
])

// Password strength result type
export interface PasswordStrengthResult {
    score: number // 0-4 (zxcvbn score)
    feedback: string[]
    crackTime: string
    crackTimeDisplay: string
}

let zxcvbnInstance: any = null

const getZxcvbn = async () => {
    if (!zxcvbnInstance) {
        const module = await import('@zxcvbn-ts/core')
        zxcvbnInstance = module.default || module.ZxcvbnFactory || module
    }
    return zxcvbnInstance
}

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
    
    // Check against common passwords
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return 'This password is too common. Please choose a more unique password.'
    }
    
    // Check for basic complexity (at least 3 of 4: upper, lower, number, special)
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecial = /[^A-Za-z0-9]/.test(password)
    
    const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length
    if (complexityCount < 3) {
        return 'Password must contain at least 3 of: uppercase letter, lowercase letter, number, special character'
    }
    
    return null
}

export const validatePasswordStrength = async (password: string): Promise<PasswordStrengthResult> => {
    if (!password) {
        return {
            score: 0,
            feedback: ['Password is required'],
            crackTime: 'instant',
            crackTimeDisplay: 'instant'
        }
    }
    
    const zxcvbn = await getZxcvbn()
    const result = zxcvbn(password)
    
    const feedback: string[] = []
    
    // Add zxcvbn feedback
    if (result.feedback.warning) {
        feedback.push(result.feedback.warning)
    }
    feedback.push(...result.feedback.suggestions)
    
    // Add custom feedback based on requirements
    if (password.length < PASSWORD_MIN_LENGTH) {
        feedback.unshift(`Use at least ${PASSWORD_MIN_LENGTH} characters`)
    }
    
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecial = /[^A-Za-z0-9]/.test(password)
    
    const missing: string[] = []
    if (!hasUpper) missing.push('uppercase letter')
    if (!hasLower) missing.push('lowercase letter')
    if (!hasNumber) missing.push('number')
    if (!hasSpecial) missing.push('special character')
    
    if (missing.length > 0) {
        feedback.unshift(`Add: ${missing.join(', ')}`)
    }
    
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        feedback.unshift('This password appears in common password lists')
    }
    
    return {
        score: result.score,
        feedback,
        crackTime: result.crackTimesSeconds.offlineFastHashing1e10PerSecond.toString(),
        crackTimeDisplay: result.crackTimesDisplay.offlineFastHashing1e10PerSecond
    }
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