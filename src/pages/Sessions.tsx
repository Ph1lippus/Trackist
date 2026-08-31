import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorSmartphone, TabletSmartphone, Laptop, MapPin, Clock3, ShieldCheck, CheckCircle2, CircleAlert } from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { useAuthStore } from '../stores/useAuthStore'
import { usePageTitle } from '../hooks/usePageTitle'

interface SessionInfo {
    id: string
    session_id: string
    device_info: {
        browser: string
        os: string
        device_type: string
    }
    ip_hash: string
    location: string
    created_at: string
    last_active: string
    revoked_at: string | null
    is_current: boolean
}

const Sessions: React.FC = () => {
    usePageTitle('Track1st - Session Management')
    const navigate = useNavigate()
    const { user, session } = useAuthStore()
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [revoking, setRevoking] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (!user) {
            navigate('/login')
            return
        }
        fetchSessions()
    }, [user, navigate])

    const parseUserAgent = (ua: string) => {
        let browser = 'Unknown'
        let os = 'Unknown'
        let device_type = 'Desktop'

        if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone') || ua.includes('iPad')) {
            device_type = 'Mobile'
        } else if (ua.includes('Tablet') || ua.includes('iPad')) {
            device_type = 'Tablet'
        }

        if (ua.includes('Firefox')) browser = 'Firefox'
        else if (ua.includes('Edg/')) browser = 'Edge'
        else if (ua.includes('Chrome') || ua.includes('CriOS')) browser = 'Chrome'
        else if (ua.includes('Safari')) browser = 'Safari'

        if (ua.includes('Windows')) os = 'Windows'
        else if (ua.includes('Mac OS X') || ua.includes('macOS')) os = 'macOS'
        else if (ua.includes('Linux')) os = 'Linux'
        else if (ua.includes('Android')) os = 'Android'
        else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

        return { browser, os, device_type }
    }

    const fetchSessions = async () => {
        if (!user) return
        setLoading(true)
        setError(null)
        try {
            // Get current session ID
            const currentSessionId = session?.access_token ? 
                btoa(session.access_token).substring(0, 32) : ''

            // Fetch from user_sessions table
            const { data, error } = await supabase
                .from('user_sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('last_active', { ascending: false })

            if (error) throw error

            const sessionList: SessionInfo[] = (data || []).map(s => ({
                ...s,
                is_current: s.session_id === currentSessionId
            }))

            // If no sessions in table but we have a current session, add it
            if (sessionList.length === 0 && session) {
                sessionList.push({
                    id: 'current',
                    session_id: currentSessionId,
                    device_info: parseUserAgent(navigator.userAgent),
                    ip_hash: 'current',
                    location: 'Current session',
                    created_at: new Date().toISOString(),
                    last_active: new Date().toISOString(),
                    revoked_at: null,
                    is_current: true
                })
            }

            setSessions(sessionList)
        } catch (err) {
            console.error('Failed to fetch sessions:', err)
            setError('Failed to load sessions')
        } finally {
            setLoading(false)
        }
    }

    const handleRevoke = async (sessionId: string) => {
        if (!confirm('Are you sure you want to revoke this session?')) return

        setRevoking(sessionId)
        setError(null)
        setSuccess(null)

        try {
            const { error } = await supabase.functions.invoke('revoke-session', {
                body: { session_id: sessionId }
            })

            if (error) throw error

            setSuccess('Session revoked successfully')
            fetchSessions()
        } catch (err) {
            console.error('Failed to revoke session:', err)
            setError('Failed to revoke session')
        } finally {
            setRevoking(null)
        }
    }

    const handleRevokeAllOthers = async () => {
        if (!confirm('This will sign you out of all other devices. Continue?')) return

        setRevoking('all')
        setError(null)
        setSuccess(null)

        try {
            const { error } = await supabase.functions.invoke('revoke-session', {
                body: { revoke_all_others: true }
            })

            if (error) throw error

            setSuccess('All other sessions revoked successfully')
            fetchSessions()
        } catch (err) {
            console.error('Failed to revoke sessions:', err)
            setError('Failed to revoke sessions')
        } finally {
            setRevoking(null)
        }
    }

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const formatLocation = (location: string) => {
        if (!location || location === 'Current session' || location === 'Unknown') {
            return <span className="session-location unknown">Unknown location</span>
        }
        return <span className="session-location">{location}</span>
    }

    if (!user) return null

    return (
        <main className="main">
            <div className="container settings-page">
                <div className="settings-panel settings-panel--subpage sessions-page">
                    <div className="settings-panel__header">
                        <div className="settings-panel__title-row">
                            <span className="settings-panel__title-icon"><ShieldCheck size={18} strokeWidth={2.2} /></span>
                            <h3>Session Management</h3>
                        </div>
                        <p className="sessions-description">
                            Review and manage every active session tied to your account.
                        </p>
                    </div>

                    {error && (
                        <span className="settings-inline-feedback settings-inline-feedback--error">
                            <CircleAlert size={13} strokeWidth={2.2} />
                            {error}
                        </span>
                    )}
                    {success && (
                        <span className="settings-inline-feedback">
                            <CheckCircle2 size={13} strokeWidth={2.2} />
                            {success}
                        </span>
                    )}

                    {loading ? (
                        <div className="sessions-loading">
                            <div className="spinner"></div>
                            <p>Loading sessions...</p>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="sessions-empty">
                            <ShieldCheck size={28} strokeWidth={2.2} />
                            <p>No active sessions found</p>
                        </div>
                    ) : (
                        <div className="sessions-list">
                            {sessions.map(s => {
                                const deviceIcon = s.device_info?.device_type === 'Mobile'
                                    ? <MonitorSmartphone size={18} strokeWidth={2.2} />
                                    : s.device_info?.device_type === 'Tablet'
                                        ? <TabletSmartphone size={18} strokeWidth={2.2} />
                                        : <Laptop size={18} strokeWidth={2.2} />

                                return (
                                    <div key={s.id} className={`session-card ${s.is_current ? 'current' : ''} ${s.revoked_at ? 'revoked' : ''}`}>
                                        <div className="session-main">
                                            <div className="session-device">
                                                <div className="session-device-icon">{deviceIcon}</div>
                                                <div className="session-device-info">
                                                    <div className="session-device-name">
                                                        {s.device_info?.browser} on {s.device_info?.os}
                                                        {s.is_current && <span className="session-current-badge">Current</span>}
                                                    </div>
                                                    <div className="session-meta">
                                                        <span className="session-location">
                                                            <MapPin size={12} strokeWidth={2} />
                                                            {formatLocation(s.location)}
                                                        </span>
                                                        <span className="session-time">
                                                            <Clock3 size={12} strokeWidth={2} />
                                                            {s.revoked_at ? `Revoked ${formatDate(s.revoked_at)}` : `Last active ${formatDate(s.last_active)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="session-actions">
                                            {!s.is_current && !s.revoked_at && (
                                                <button
                                                    className="settings-btn settings-btn--secondary"
                                                    onClick={() => handleRevoke(s.session_id)}
                                                    disabled={revoking === s.session_id}
                                                >
                                                    {revoking === s.session_id ? 'Revoking...' : 'Revoke'}
                                                </button>
                                            )}
                                            {s.is_current && (
                                                <span className="session-current-label">This device</span>
                                            )}
                                            {s.revoked_at && (
                                                <span className="session-revoked-label">Revoked</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {sessions.some(s => !s.is_current && !s.revoked_at) && (
                        <div className="sessions-bulk-actions">
                            <button
                                className="settings-btn settings-btn--danger"
                                onClick={handleRevokeAllOthers}
                                disabled={revoking === 'all'}
                            >
                                {revoking === 'all' ? 'Revoking...' : 'Revoke All Other Sessions'}
                            </button>
                            <span className="sessions-bulk-note">This signs you out of every other device except this one.</span>
                        </div>
                    )}

                    <div className="sessions-security-tips">
                        <h4>Security tips</h4>
                        <ul>
                            <li>Review old sessions regularly and revoke anything you do not recognize.</li>
                            <li>Use 2FA for extra protection on your account.</li>
                            <li>Sign out of shared or public devices after use.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default Sessions