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
                setCaptchaError(error.message || 'Captcha verification failed')
                return false
            }

            if (!data?.success) {
                setCaptchaError(data?.error || 'Captcha verification failed')
                return false
            }

            return true
        } catch (err) {
            console.error('Captcha verification error:', err)
            setCaptchaError('Captcha verification failed. Please try again.')
            return false
        } finally {
            setVerifying(false)
        }
    }, [])

    return { verifyCaptcha, captchaError, verifying }
}