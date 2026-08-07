import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { usePageTitle } from '../hooks/usePageTitle'
import ConfirmModal from '../components/modals/ConfirmModal'
import type { User } from '@supabase/supabase-js'

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
    totalMovies: number
    totalTVShows: number
    totalCompleted: number
    totalEpisodes: number
    avgScore: number | null
    usersThisMonth: number
    usersThisWeek: number
}

type TabType = 'overview' | 'users'

const Admin: React.FC = () => {
    usePageTitle('Trackist - Admin')
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<{ role: string | null } | null>(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [profiles, setProfiles] = useState<ProfileRow[]>([])
    const [stats, setStats] = useState<AdminStats>({
        totalUsers: 0,
        totalWatchlistItems: 0,
        totalLists: 0,
        totalMovies: 0,
        totalTVShows: 0,
        totalCompleted: 0,
        totalEpisodes: 0,
        avgScore: null,
        usersThisMonth: 0,
        usersThisWeek: 0
    })
    const [statsLoading, setStatsLoading] = useState(true)
    const [roleConfirm, setRoleConfirm] = useState<{ userId: string; newRole: string; displayName: string } | null>(null)
    const [roleLoading, setRoleLoading] = useState(false)

    const isAdmin = profile?.role === 'admin'

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data } = await supabase.auth.getUser()
                setUser(data.user)

                if (data.user) {
                    const { data: profileData, error: profileError } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', data.user.id)
                        .single()

                    if (profileError) {
                        console.error('Admin page: profile fetch error', profileError)
                        setAuthError('Unable to verify permissions.')
                    } else {
                        setProfile(profileData)
                    }
                }
            } catch (err) {
                console.error('Admin page: auth error', err)
                setAuthError('Authentication check failed.')
            } finally {
                setLoading(false)
            }
        }
        checkAuth()
    }, [])

    useEffect(() => {
        if (!isAdmin || !user) return

        const fetchData = async () => {
            try {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, display_name, role, created_at, updated_at')
                    .order('created_at', { ascending: false })

                setProfiles(profilesData || [])

                const now = new Date()
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

                const { count: watchlistCount } = await supabase
                    .from('watchlist')
                    .select('*', { count: 'exact', head: true })

                const { count: listsCount } = await supabase
                    .from('lists')
                    .select('*', { count: 'exact', head: true })

                const { count: moviesCount } = await supabase
                    .from('watchlist')
                    .select('*', { count: 'exact', head: true })
                    .eq('media_type', 'movie')

                const { count: tvCount } = await supabase
                    .from('watchlist')
                    .select('*', { count: 'exact', head: true })
                    .eq('media_type', 'tv')

                const { count: completedCount } = await supabase
                    .from('watchlist')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'completed')

                const { count: episodesCount } = await supabase
                    .from('watchlist_episodes')
                    .select('*', { count: 'exact', head: true })

                const { data: scoreData } = await supabase
                    .from('watchlist')
                    .select('vote_average')
                    .not('vote_average', 'is', null)
                    .gt('vote_average', 0)

                const avgScore = scoreData && scoreData.length > 0
                    ? Math.round((scoreData.reduce((sum, item) => sum + (item.vote_average || 0), 0) / scoreData.length) * 10) / 10
                    : null

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
                    totalMovies: moviesCount || 0,
                    totalTVShows: tvCount || 0,
                    totalCompleted: completedCount || 0,
                    totalEpisodes: episodesCount || 0,
                    avgScore,
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
                alert('Failed to update role. Please try again.')
            } else {
                setProfiles(prev => prev.map(p => p.id === roleConfirm.userId ? { ...p, role: roleConfirm.newRole } : p))
            }
        } catch (err) {
            console.error('Role update error:', err)
            alert('An unexpected error occurred.')
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
                    </div>
                </div>
            </section>
        )
    }

    if (!isAdmin || !user) {
        return <Navigate to="/" replace />
    }

    if (authError) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading">
                        <p style={{ color: '#ff6b6b' }}>{authError}</p>
                        <button className="discover-loading__retry" onClick={() => window.location.reload()}>Retry</button>
                    </div>
                </div>
            </section>
        )
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—'
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
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
                            <div className="stats-hero-card__icon"><i className="fas fa-users"></i></div>
                            <div className="stats-hero-card__value">{stats.totalUsers}</div>
                            <div className="stats-hero-card__label">Total Users</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--mint">
                            <div className="stats-hero-card__icon"><i className="fas fa-bookmark"></i></div>
                            <div className="stats-hero-card__value">{stats.totalWatchlistItems.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Watchlist Items</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--gold">
                            <div className="stats-hero-card__icon"><i className="fas fa-list"></i></div>
                            <div className="stats-hero-card__value">{stats.totalLists.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Lists</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--blue">
                            <div className="stats-hero-card__icon"><i className="fas fa-film"></i></div>
                            <div className="stats-hero-card__value">{stats.totalMovies.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Movies</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--purple">
                            <div className="stats-hero-card__icon"><i className="fas fa-tv"></i></div>
                            <div className="stats-hero-card__value">{stats.totalTVShows.toLocaleString()}</div>
                            <div className="stats-hero-card__label">TV Shows</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--pink">
                            <div className="stats-hero-card__icon"><i className="fas fa-check-circle"></i></div>
                            <div className="stats-hero-card__value">{stats.totalCompleted.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Completed</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--teal">
                            <div className="stats-hero-card__icon"><i className="fas fa-play-circle"></i></div>
                            <div className="stats-hero-card__value">{stats.totalEpisodes.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Episodes</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--orange">
                            <div className="stats-hero-card__icon"><i className="fas fa-star"></i></div>
                            <div className="stats-hero-card__value">{stats.avgScore !== null ? stats.avgScore.toFixed(1) : '—'}</div>
                            <div className="stats-hero-card__label">Avg Score</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--cyan">
                            <div className="stats-hero-card__icon"><i className="fas fa-user-plus"></i></div>
                            <div className="stats-hero-card__value">{stats.usersThisWeek}</div>
                            <div className="stats-hero-card__label">New This Week</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--indigo">
                            <div className="stats-hero-card__icon"><i className="fas fa-calendar"></i></div>
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
                                            <td>{formatDate(profile.created_at)}</td>
                                            <td>{formatDate(profile.updated_at)}</td>
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
                        <div className="admin-users-cards">
                            {profiles.map(profile => (
                                <div key={profile.id} className="admin-user-card">
                                    <div className="admin-user-card__header">
                                        <div className="admin-user-card__name">{profile.display_name || '—'}</div>
                                        <span className={`admin-role-badge admin-role-badge--${profile.role || 'user'}`}>
                                            {profile.role || 'user'}
                                        </span>
                                    </div>
                                    <div className="admin-user-card__meta">
                                        <div className="admin-user-card__meta-item">
                                            <i className="fas fa-calendar-plus"></i>
                                            <span>Joined {formatDate(profile.created_at)}</span>
                                        </div>
                                        <div className="admin-user-card__meta-item">
                                            <i className="fas fa-clock"></i>
                                            <span>Updated {formatDate(profile.updated_at)}</span>
                                        </div>
                                    </div>
                                    {profile.id !== user.id && (
                                        <button
                                            className="admin-user-card__action"
                                            onClick={() => setRoleConfirm({
                                                userId: profile.id,
                                                newRole: profile.role === 'admin' ? 'user' : 'admin',
                                                displayName: profile.display_name || 'Unknown'
                                            })}
                                        >
                                            <i className={`fas ${profile.role === 'admin' ? 'fa-user-xmark' : 'fa-user-shield'}`}></i>
                                            {profile.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                                        </button>
                                    )}
                                </div>
                            ))}
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
