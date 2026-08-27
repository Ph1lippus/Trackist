import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuthStore } from '../stores/useAuthStore'
import { usePageTitle } from '../hooks/usePageTitle'

interface AuditLogEntry {
    id: number
    user_id: string | null
    event_type: string
    ip_hash: string | null
    user_agent: string | null
    metadata: Record<string, unknown>
    risk_score: number
    created_at: string
    user_email?: string
}

const AdminSecurity: React.FC = () => {
    usePageTitle('Trackist - Security Audit Log')
    const { user } = useAuthStore()
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filters, setFilters] = useState({
        eventType: '',
        userId: '',
        minRiskScore: 0,
        dateFrom: '',
        dateTo: '',
        search: ''
    })
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 50,
        total: 0
    })

    const eventTypes = [
        'login_success', 'login_failure', 'mfa_enroll', 'mfa_verify', 'mfa_failure',
        'password_change', 'password_reset_request', 'session_revoke', 'session_revoke_all',
        'backup_code_used', 'register', 'logout', 'email_change', 'suspicious_activity'
    ]

    const isAdmin = user?.app_metadata?.is_admin === true

    useEffect(() => {
        if (!isAdmin) return
        fetchLogs()
    }, [isAdmin, pagination.page, filters])

    const fetchLogs = async () => {
        setLoading(true)
        setError(null)

        try {
            let query = supabase
                .from('auth_audit_log')
                .select('*', { count: 'exact' })

            if (filters.eventType) {
                query = query.eq('event_type', filters.eventType)
            }
            if (filters.userId) {
                query = query.eq('user_id', filters.userId)
            }
            if (filters.minRiskScore > 0) {
                query = query.gte('risk_score', filters.minRiskScore)
            }
            if (filters.dateFrom) {
                query = query.gte('created_at', filters.dateFrom)
            }
            if (filters.dateTo) {
                query = query.lte('created_at', filters.dateTo)
            }
            if (filters.search) {
                query = query.or(`metadata->>email.ilike.%${filters.search}%,metadata->>ip.ilike.%${filters.search}%`)
            }

            const from = (pagination.page - 1) * pagination.pageSize
            const to = from + pagination.pageSize - 1

            query = query.order('created_at', { ascending: false }).range(from, to)

            const { data, error, count } = await query

            if (error) throw error

            setLogs(data || [])
            setPagination(prev => ({ ...prev, total: count || 0 }))
        } catch (err) {
            console.error('Failed to fetch audit logs:', err)
            setError('Failed to load audit logs')
        } finally {
            setLoading(false)
        }
    }

    const handleFilterChange = (key: string, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }))
        setPagination(prev => ({ ...prev, page: 1 }))
    }

    const handleExport = async () => {
        try {
            let query = supabase
                .from('auth_audit_log')
                .select('*')

            if (filters.eventType) query = query.eq('event_type', filters.eventType)
            if (filters.userId) query = query.eq('user_id', filters.userId)
            if (filters.minRiskScore > 0) query = query.gte('risk_score', filters.minRiskScore)
            if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
            if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

            query = query.order('created_at', { ascending: false }).limit(10000)

            const { data, error } = await query
            if (error) throw error

            const csv = [
                ['ID', 'User ID', 'User Email', 'Event Type', 'IP Hash', 'User Agent', 'Risk Score', 'Created At', 'Metadata'].join(','),
                ...(data || []).map(log => [
                    log.id,
                    log.user_id || '',
                    log.user_email || '',
                    log.event_type,
                    log.ip_hash || '',
                    (log.user_agent || '').replace(/"/g, '""'),
                    log.risk_score,
                    log.created_at,
                    JSON.stringify(log.metadata).replace(/"/g, '""')
                ].map(v => `"${v}"`).join(','))
            ].join('\n')

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
            link.click()
        } catch (err) {
            console.error('Export failed:', err)
            alert('Failed to export audit log')
        }
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const getRiskColor = (score: number) => {
        if (score >= 70) return '#ff6b6b'
        if (score >= 40) return '#ffd93d'
        return '#68ffae'
    }

    const getEventTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            login_success: 'Login Success',
            login_failure: 'Login Failed',
            mfa_enroll: 'MFA Enrolled',
            mfa_verify: 'MFA Verified',
            mfa_failure: 'MFA Failed',
            password_change: 'Password Changed',
            password_reset_request: 'Password Reset Requested',
            session_revoke: 'Session Revoked',
            session_revoke_all: 'All Sessions Revoked',
            backup_code_used: 'Backup Code Used',
            register: 'Registration',
            logout: 'Logout',
            email_change: 'Email Changed',
            suspicious_activity: 'Suspicious Activity'
        }
        return labels[type] || type
    }

    if (!isAdmin) {
        return (
            <main className="main">
                <div className="auth-layout">
                    <div className="auth-form-wrapper">
                        <div className="auth-card">
                            <h2 className="auth-title">Access Denied</h2>
                            <p>You don't have permission to view this page.</p>
                        </div>
                    </div>
                </div>
            </main>
        )
    }

    const totalPages = Math.ceil(pagination.total / pagination.pageSize)

    return (
        <main className="main">
            <div className="auth-layout">
                <div className="auth-form-wrapper" style={{ maxWidth: '1200px' }}>
                    <div className="auth-card admin-security-page">
                        <div className="admin-security-header">
                            <h2 className="auth-title">Security Audit Log</h2>
                            <p className="admin-security-description">
                                Monitor and analyze authentication events for security anomalies.
                            </p>
                        </div>

                        {error && <div className="auth-alert auth-alert--error">{error}</div>}

                        {/* Filters */}
                        <div className="admin-filters">
                            <div className="filter-row">
                                <div className="filter-group">
                                    <label>Event Type</label>
                                    <select
                                        value={filters.eventType}
                                        onChange={e => handleFilterChange('eventType', e.target.value)}
                                        className="filter-select"
                                    >
                                        <option value="">All Events</option>
                                        {eventTypes.map(type => (
                                            <option key={type} value={type}>{getEventTypeLabel(type)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="filter-group">
                                    <label>Min Risk Score</label>
                                    <select
                                        value={filters.minRiskScore}
                                        onChange={e => handleFilterChange('minRiskScore', parseInt(e.target.value))}
                                        className="filter-select"
                                    >
                                        <option value={0}>All Scores</option>
                                        <option value={40}>Medium+ (≥40)</option>
                                        <option value={70}>High+ (≥70)</option>
                                    </select>
                                </div>

                                <div className="filter-group">
                                    <label>Date From</label>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={e => handleFilterChange('dateFrom', e.target.value)}
                                        className="filter-input"
                                    />
                                </div>

                                <div className="filter-group">
                                    <label>Date To</label>
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={e => handleFilterChange('dateTo', e.target.value)}
                                        className="filter-input"
                                    />
                                </div>
                            </div>

                            <div className="filter-row">
                                <div className="filter-group search-group">
                                    <label>Search</label>
                                    <input
                                        type="text"
                                        placeholder="Search by email, IP..."
                                        value={filters.search}
                                        onChange={e => handleFilterChange('search', e.target.value)}
                                        className="filter-input"
                                    />
                                </div>

                                <div className="filter-actions">
                                    <button className="auth-submit-btn auth-submit-btn--secondary" onClick={handleExport}>
                                        <i className="fa-solid fa-download"></i> Export CSV
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Summary */}
                        <div className="admin-stats">
                            <div className="stat-card">
                                <span className="stat-value">{pagination.total}</span>
                                <span className="stat-label">Total Events</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">
                                    {logs.filter(l => l.risk_score >= 70).length}
                                </span>
                                <span className="stat-label">High Risk</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">
                                    {logs.filter(l => l.risk_score >= 40 && l.risk_score < 70).length}
                                </span>
                                <span className="stat-label">Medium Risk</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">
                                    {logs.filter(l => l.event_type === 'login_failure').length}
                                </span>
                                <span className="stat-label">Failed Logins</span>
                            </div>
                        </div>

                        {/* Logs Table */}
                        <div className="admin-logs-table-wrapper">
                            {loading ? (
                                <div className="sessions-loading">
                                    <div className="spinner"></div>
                                    <p>Loading audit logs...</p>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="sessions-empty">
                                    <i className="fa-solid fa-magnifying-glass"></i>
                                    <p>No audit logs found</p>
                                </div>
                            ) : (
                                <table className="admin-logs-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Event</th>
                                            <th>User</th>
                                            <th>Risk</th>
                                            <th>IP Hash</th>
                                            <th>Metadata</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id}>
                                                <td className="log-time">{formatDate(log.created_at)}</td>
                                                <td className="log-event">{getEventTypeLabel(log.event_type)}</td>
                                                <td className="log-user">
                                                    {log.user_email}
                                                    {log.user_id && <span className="log-user-id">({log.user_id.substring(0, 8)}...)</span>}
                                                </td>
                                                <td className="log-risk">
                                                    <span 
                                                        className="risk-badge"
                                                        style={{ backgroundColor: getRiskColor(log.risk_score), color: log.risk_score >= 70 ? '#000' : '#000' }}
                                                    >
                                                        {log.risk_score}
                                                    </span>
                                                </td>
                                                <td className="log-ip">{log.ip_hash || '-'}</td>
                                                <td className="log-metadata">
                                                    <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="admin-pagination">
                                <button
                                    className="pagination-btn"
                                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                    disabled={pagination.page === 1}
                                >
                                    <i className="fa-solid fa-chevron-left"></i> Previous
                                </button>
                                <span className="pagination-info">
                                    Page {pagination.page} of {totalPages} ({pagination.total} total)
                                </span>
                                <button
                                    className="pagination-btn"
                                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                    disabled={pagination.page >= totalPages}
                                >
                                    Next <i className="fa-solid fa-chevron-right"></i>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}

export default AdminSecurity