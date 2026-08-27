import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'

interface CaptchaProps {
    onVerify: (token: string) => void
    onError?: (error: string) => void
    action?: string
}

export interface CaptchaHandle {
    execute: () => void
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

const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(({ onVerify, onError, action = 'login' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const initializedRef = useRef(false)
    const onVerifyRef = useRef(onVerify)
    const onErrorRef = useRef(onError)
    const actionRef = useRef(action)

    onVerifyRef.current = onVerify
    onErrorRef.current = onError
    actionRef.current = action

    const cleanup = useCallback(() => {
        if (widgetIdRef.current && window.hcaptcha) {
            try {
                window.hcaptcha.reset(widgetIdRef.current)
            } catch {
            }
            widgetIdRef.current = null
        }
        initializedRef.current = false
    }, [])

    useImperativeHandle(ref, () => ({
        execute: () => {
            if (widgetIdRef.current && window.hcaptcha) {
                try {
                    window.hcaptcha.execute(widgetIdRef.current)
                } catch (err) {
                    console.error('hCaptcha execute error:', err)
                    onErrorRef.current?.('Captcha execution failed. Please try again.')
                }
            } else {
                console.warn('hCaptcha not initialized for action:', actionRef.current)
            }
        }
    }), [cleanup])

    useEffect(() => {
        const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY
        
        if (!siteKey) {
            console.warn('hCaptcha site key not configured')
            return
        }

        cleanup()

        const hasHcaptcha = () => !!window.hcaptcha && typeof window.hcaptcha.render === 'function'

        const initCaptcha = async () => {
            if (initializedRef.current || !containerRef.current) return

            if (!hasHcaptcha()) {
                await new Promise<void>((resolve) => {
                    const check = setInterval(() => {
                        if (hasHcaptcha()) {
                            clearInterval(check)
                            resolve()
                        }
                    }, 50)
                })
            }

            if (!containerRef.current || initializedRef.current) return

            widgetIdRef.current = window.hcaptcha!.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => {
                    console.log('hCaptcha verified for action:', actionRef.current)
                    onVerifyRef.current(token)
                },
                'expired-callback': () => {
                    console.warn('hCaptcha expired for action:', actionRef.current)
                    if (widgetIdRef.current) {
                        window.hcaptcha!.reset(widgetIdRef.current)
                    }
                },
                'error-callback': () => {
                    console.error('hCaptcha error for action:', actionRef.current)
                    onErrorRef.current?.('Captcha verification failed. Please try again.')
                },
                size: 'invisible'
            })
            initializedRef.current = true
            console.log('hCaptcha initialized for action:', action)
        }

        if (!document.getElementById('hcaptcha-script')) {
            const script = document.createElement('script')
            script.id = 'hcaptcha-script'
            script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'
            script.async = true
            script.defer = true
            document.head.appendChild(script)
            script.onload = () => {
                initCaptcha()
            }
        } else if (hasHcaptcha()) {
            initCaptcha()
        }

        return () => {
            cleanup()
        }
    }, [action, cleanup])

    return (
        <div ref={containerRef} style={{ display: 'none' }} aria-hidden="true" />
    )
})

Captcha.displayName = 'Captcha'

export default Captcha
