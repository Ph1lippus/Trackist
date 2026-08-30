import React, { useEffect, useRef, useState } from 'react'
import { Share } from '@capacitor/share'
import { isNativePlatform } from '../../services/nativePush'

interface ShareButtonProps {
    url: string
    title?: string
    text?: string
}

const ShareButton: React.FC<ShareButtonProps> = ({ url, title, text }) => {
    const [copied, setCopied] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [])

    const handleShare = async () => {
        const shareData = { title, text, url }

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
            await navigator.clipboard.writeText(url)
            setCopied(true)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard unavailable, do nothing
        }
    }

    return (
        <button
            className="detail-page__icon-btn"
            onClick={handleShare}
            title={copied ? 'Link copied!' : 'Share'}
        >
            <i className={copied ? 'fa-solid fa-check' : 'fa-solid fa-share-nodes'}></i>
        </button>
    )
}

export default ShareButton