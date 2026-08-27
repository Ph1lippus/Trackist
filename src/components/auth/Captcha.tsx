import React, { useEffect, useRef } from 'react'

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
    const scriptLoadedRef = useRef(false)

    useEffect(() => {
        const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY
        
        if (!siteKey) {
            console.warn('hCaptcha site key not configured')
            return
        }

        const loadScript = () => {
            if (scriptLoadedRef.current || document.getElementById('hcaptcha-script')) {
                initCaptcha()
                return
            }

            const script = document.createElement('script')
            script.id = 'hcaptcha-script'
            script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'
            script.async = true
            script.defer = true
            script.onload = initCaptcha
            script.onerror = () => {
                onError?.('Failed to load hCaptcha')
            }
            document.head.appendChild(script)
            scriptLoadedRef.current = true
        }

        const initCaptcha = () => {
            if (!window.hcaptcha || !containerRef.current) return

            try {
                widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
                    sitekey: siteKey,
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
            } catch (err) {
                console.error('hCaptcha init error:', err)
                onError?.('Captcha initialization failed')
            }
        }

        loadScript()

        return () => {
            if (widgetIdRef.current && window.hcaptcha) {
                try {
                    window.hcaptcha.reset(widgetIdRef.current)
                } catch {
                }
            }
        }
    }, [action, onVerify, onError])

    return (
        <div ref={containerRef} style={{ display: 'none' }} aria-hidden="true" />
    )
}

export default Captcha