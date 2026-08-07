import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { usePageTitle } from '../hooks/usePageTitle'
import ConfirmModal from '../components/modals/ConfirmModal'

interface ProfileRow {
    id: string
    display_name: string | null
    role: string | null
    created_at: string
    updated_at: string
}

interface AdminStats {
    totalUsers: number
    totalWatchlistItems: number
    totalLists: number
    usersThisMonth: number
    usersThisWeek: number
}

type TabType = 'overview' | 'users'

const Admin: React.FC = () => {
    usePageTitle('Trackist - Admin')
    const { user, profile } = useAuth(true)
    const activeTabState = useState<TabType>('overview')
    const [activeTab, setActiveTab] = activeTabState
    const [profiles, setProfiles] = useState<ProfileRow[]>([])
    const [stats, setStats] = useState<AdminStats>({
        totalUsers: 0,
        totalWatchlistItems: 0,
        totalLists: 0,
        usersThisMonth: 0,
        usersThisWeek: 0
    })
    const [statsLoading, setStatsLoading] = useState(true)
    const [roleConfirm, setRoleConfirm] = useState<{ userId: string; newRole: string; displayName: string } | null>(null)
    const [roleLoading, setRoleLoading] = useState(false)

    const isAdmin = profile?.role === 'admin'
    const loading = Boolean(user && !profile)

    console.log('[Admin] render state:', { userId: user?.id, profileRole: profile?.role, isAdmin, loading })

    const handleRetry = () => {
        window.location.reload()
    }

    useEffect(() => {
        if (!isAdmin || !user) {
            return
        }

        const fetchData = async () => {
            try {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, display_name, role, created_at, updated_at')
                    .order('created_at', { ascending: false })

                if (profilesError) {
                    console.error('Failed to fetch profiles:', profilesError)
                } else {
                    setProfiles(profilesData || [])
                }

                const now = new Date()
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

                const { count: watchlistCount } = await supabase
                    .from('watchlist')
                    .select('*', { count: 'exact', head: true })

                const { count: listsCount } = await supabase
                    .from('lists')
                    .select('*', { count: 'exact', head: true })

                const { count: weekCount } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', weekAgo)

                const { count: monthCount } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', monthAgo)

                setStats({
                    totalUsers: profilesData?.length || 0,
                    totalWatchlistItems: watchlistCount || 0,
                    totalLists: listsCount || 0,
                    usersThisWeek: weekCount || 0,
                    usersThisMonth: monthCount || 0
                })
            } catch (err) {
                console.error('Failed to fetch admin data:', err)
            } finally {
                setStatsLoading(false)
            }
        }

        fetchData()
    }, [isAdmin, user])

    const handleRoleChange = async () => {
        if (!roleConfirm) return
        setRoleLoading(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: roleConfirm.newRole })
                .eq('id', roleConfirm.userId)

            if (error) {
                console.error('Failed to update role:', error)
            } else {
                setProfiles(prev => prev.map(p => p.id === roleConfirm.userId ? { ...p, role: roleConfirm.newRole } : p))
            }
        } catch (err) {
            console.error('Role update error:', err)
        } finally {
            setRoleLoading(false)
            setRoleConfirm(null)
        }
    }

    if (loading) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading admin data...</p>
                        <button className="discover-loading__retry" onClick={handleRetry}>Retry</button>
                    </div>
                </div>
            </section>
        )
    }

    if (!isAdmin || !user) {
        return <Navigate to="/" replace />
    }

    if (loading) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading">
                        <div className="discover-spinner" />
                        <p>Loading admin data...</p>
                        <button className="discover-loading__retry" onClick={handleRetry}>Retry</button>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <div className="admin-page">
            <div className="admin-container">
                <div className="admin-header">
                    <h1 className="admin-title">Admin Panel</h1>
                    <p className="admin-subtitle">Platform overview and user management</p>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        All Users
                    </button>
                </div>

                {activeTab === 'overview' && (
                    <div className="admin-stats-grid">
                        <div className="stats-hero-card stats-hero-card--primary">
                            <div className="stats-hero-card__value">{stats.totalUsers}</div>
                            <div className="stats-hero-card__label">Total Users</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--mint">
                            <div className="stats-hero-card__value">{stats.totalWatchlistItems.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Watchlist Items</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--gold">
                            <div className="stats-hero-card__value">{stats.totalLists.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Lists</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--blue">
                            <div className="stats-hero-card__value">{stats.usersThisWeek}</div>
                            <div className="stats-hero-card__label">New This Week</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--purple">
                            <div className="stats-hero-card__value">{stats.usersThisMonth}</div>
                            <div className="stats-hero-card__label">New This Month</div>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="admin-users-panel">
                        <div className="admin-users-table-wrap">
                            <table className="admin-users-table">
                                <thead>
                                    <tr>
                                        <th>Display Name</th>
                                        <th>Role</th>
                                        <th>Joined</th>
                                        <th>Last Updated</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profiles.map(profile => (
                                        <tr key={profile.id}>
                                            <td>{profile.display_name || '—'}</td>
                                            <td>
                                                <span className={`admin-role-badge admin-role-badge--${profile.role || 'user'}`}>
                                                    {profile.role || 'user'}
                                                </span>
                                            </td>
                                            <td>{new Date(profile.created_at).toLocaleDateString()}</td>
                                            <td>{new Date(profile.updated_at).toLocaleDateString()}</td>
                                            <td>
                                                {profile.id !== user.id && (
                                                    <button
                                                        className="admin-action-btn"
                                                        onClick={() => setRoleConfirm({
                                                            userId: profile.id,
                                                            newRole: profile.role === 'admin' ? 'user' : 'admin',
                                                            displayName: profile.display_name || 'Unknown'
                                                        })}
                                                        title={profile.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                                                    >
                                                        <i className={`fas ${profile.role === 'admin' ? 'fa-user-xmark' : 'fa-user-shield'}`}></i>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {profiles.length === 0 && !statsLoading && (
                                <p className="stats-empty">No users found.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={!!roleConfirm}
                title="Change User Role"
                message={`Are you sure you want to ${roleConfirm?.newRole === 'admin' ? 'promote' : 'demote'} "${roleConfirm?.displayName}" to ${roleConfirm?.newRole}?`}
                onConfirm={handleRoleChange}
                onCancel={() => setRoleConfirm(null)}
                confirmText={roleLoading ? 'Saving...' : 'Confirm'}
                confirmColor={roleConfirm?.newRole === 'admin' ? 'success' : 'danger'}
                disabled={roleLoading}
                confirmLoading={roleLoading}
            />
        </div>
    )
}

export default Admin
