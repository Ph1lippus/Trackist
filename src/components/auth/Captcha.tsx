import React, { useEffect, useRef, useCallback } from 'react'

interface CaptchaProps {
    onVerify: (token: string) => void
    onError?: (error: string) => void
    action?: string
}

declare global {
    interface Window {
        hcaptcha: {
            render: (container: string | HTMLElement, options: {
                sitekey: string
                callback: (token: string) => void
                'expired-callback': () => void
                'error-callback': () => void
                size?: 'invisible' | 'normal' | 'compact'
                theme?: 'light' | 'dark'
            }) => string
            reset: (widgetId: string) => void
            execute: (widgetId: string) => void
            getResponse: (widgetId: string) => string
        }
        hcaptchaOnLoad?: () => void
    }
}

const Captcha: React.FC<CaptchaProps> = ({ onVerify, onError, action = 'login' }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const initializedRef = useRef(false)
    const initPromiseRef = useRef<Promise<void> | null>(null)

    const cleanup = useCallback(() => {
        if (widgetIdRef.current && window.hcaptcha) {
            try {
                window.hcaptcha.reset(widgetIdRef.current)
            } catch {
            }
            widgetIdRef.current = null
        }
        initializedRef.current = false
        initPromiseRef.current = null
    }, [])

    const waitForHcaptcha = (): Promise<void> => {
        return new Promise((resolve) => {
            if (window.hcaptcha?.render) {
                resolve()
                return
            }
            const check = setInterval(() => {
                if (window.hcaptcha?.render) {
                    clearInterval(check)
                    resolve()
                }
            }, 50)
        })
    }

    const initCaptcha = useCallback(async () => {
        if (initializedRef.current || !containerRef.current) return

        try {
            await waitForHcaptcha()
            
            if (!containerRef.current || initializedRef.current) return

            widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
                sitekey: import.meta.env.VITE_HCAPTCHA_SITE_KEY,
                callback: (token: string) => {
                    onVerify(token)
                },
                'expired-callback': () => {
                    if (widgetIdRef.current) {
                        window.hcaptcha.reset(widgetIdRef.current)
                    }
                },
                'error-callback': () => {
                    onError?.('Captcha verification failed. Please try again.')
                },
                size: 'invisible'
            })
            initializedRef.current = true
        } catch (err) {
            console.error('hCaptcha init error:', err)
            onError?.('Captcha initialization failed')
        }
    }, [onVerify, onError])

    useEffect(() => {
        const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY
        
        if (!siteKey) {
            console.warn('hCaptcha site key not configured')
            return
        }

        cleanup()

        // Load script if not already loaded
        if (!document.getElementById('hcaptcha-script')) {
            const script = document.createElement('script')
            script.id = 'hcaptcha-script'
            script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'
            script.async = true
            script.defer = true
            document.head.appendChild(script)
        }

        // Initialize after script loads
        initPromiseRef.current = initCaptcha()

        return () => {
            cleanup()
        }
    }, [action, initCaptcha, cleanup])

    return (
        <div ref={containerRef} style={{ display: 'none' }} aria-hidden="true" />
    )
}

export default Captcha