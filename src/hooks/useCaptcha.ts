import { useCallback, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { isNativePlatform } from '../services/nativePush'

/**
 * Whether the hCaptcha flow should be enforced.
 * Automatically disabled in local development (hCaptcha rejects challenges from
 * localhost unless the hostname is allowlisted on the site key) and when no
 * site key is configured. Can also be force-disabled via VITE_HCAPTCHA_ENABLED=false.
 * Also disabled inside the native Android app, where hCaptcha does not load
 * in an embedded WebView (challenges never resolve).
 */
export function isCaptchaEnabled(): boolean {
    if (isNativePlatform()) return false
    if (import.meta.env.VITE_HCAPTCHA_ENABLED === 'false') return false
    if (!import.meta.env.VITE_HCAPTCHA_SITE_KEY) return false
    if (import.meta.env.DEV) return false
    return true
}

interface UseCaptchaReturn {
    verifyCaptcha: (token: string) => Promise<boolean>
    captchaError: string | null
    verifying: boolean
}

export function useCaptcha(): UseCaptchaReturn {
    const [captchaError, setCaptchaError] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)

    const verifyCaptcha = useCallback(async (token: string): Promise<boolean> => {
        // Captcha is disabled (e.g. local dev) - always pass
        if (!isCaptchaEnabled()) {
            return true
        }

        setVerifying(true)
        setCaptchaError(null)
        
        try {
            const { data, error } = await supabase.functions.invoke('hcaptcha-verify', {
                body: { token }
            })

            if (error) {
                const message = typeof error === 'string' ? error : (error as any)?.message || 'Captcha verification failed'
                setCaptchaError(message)
                return false
            }

            if (!data?.success) {
                const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].join(', ') : ''
                const details = data?.error || 'Captcha verification failed'
                setCaptchaError(codes ? `${details}: ${codes}` : details)
                return false
            }

            return true
        } catch (err: any) {
            console.error('Captcha verification error:', err)
            setCaptchaError(err?.message || 'Captcha verification failed. Please try again.')
            return false
        } finally {
            setVerifying(false)
        }
    }, [])

    return { verifyCaptcha, captchaError, verifying }
}