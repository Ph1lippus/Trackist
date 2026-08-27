import { useCallback, useState } from 'react'
import { supabase } from '../services/supabaseClient'

interface UseCaptchaReturn {
    verifyCaptcha: (token: string) => Promise<boolean>
    captchaError: string | null
    verifying: boolean
}

export function useCaptcha(): UseCaptchaReturn {
    const [captchaError, setCaptchaError] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)

    const verifyCaptcha = useCallback(async (token: string): Promise<boolean> => {
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
                const details = codes || data?.error || 'Captcha verification failed'
                setCaptchaError(details)
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