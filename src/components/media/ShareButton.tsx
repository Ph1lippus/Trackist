import React, { useEffect, useRef, useState } from 'react'
import { Share } from '@capacitor/share'
import { isNativePlatform } from '../../services/nativePush'
import { Check, Share2 } from 'lucide-react'

const PUBLIC_APP_URL = 'https://track1st.vercel.app'

const getShareUrl = (url: string): string => {
    try {
        const parsedUrl = new URL(url)
        if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '[::1]') {
            parsedUrl.protocol = 'https:'
            parsedUrl.host = new URL(PUBLIC_APP_URL).host
            parsedUrl.port = ''
            return parsedUrl.toString()
        }
    } catch {
        return url
    }

    return url
}

interface ShareButtonProps {
    url: string
    title?: string
    text?: string
    className?: string
    label?: string
    showIcon?: boolean
}

const ShareButton: React.FC<ShareButtonProps> = ({ url, title, text, className = 'detail-page__icon-btn', label, showIcon = true }) => {
    const [copied, setCopied] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [])

    const handleShare = async () => {
        const shareUrl = getShareUrl(url)
        const shareData = { title, text, url: shareUrl }

        if (isNativePlatform()) {
            try {
                await Share.share(shareData)
                return
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return
            }
        }

        if (navigator.share) {
            try {
                await navigator.share(shareData)
                return
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return
            }
        }

        if (!navigator.clipboard?.writeText) return

        try {
            await navigator.clipboard.writeText(shareData.url)
            setCopied(true)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard unavailable, do nothing
        }
    }

    return (
        <button
            type="button"
            className={className}
            onClick={handleShare}
            title={copied ? 'Link copied!' : 'Share'}
        >
            {showIcon && (copied ? <Check size={18} /> : <Share2 size={18} />)}
            {label && <span>{copied ? 'Link copied' : label}</span>}
        </button>
    )
}

export default React.memo(ShareButton)