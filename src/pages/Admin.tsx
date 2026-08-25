import React, { useEffect, useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { uploadAvatar } from '../services/profileService'
import { useAuthStore } from '../stores/useAuthStore'
import ConfirmModal from '../components/modals/ConfirmModal'



interface ProfileRow {
    id: string
    display_name: string | null
    avatar_url: string | null
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

type TabType = 'overview' | 'users' | 'user-stats'

interface UserStats {
    id: string
    display_name: string | null
    role: string | null
    created_at: string
    watchlist_count: number
    movies_count: number
    tv_count: number
    completed_count: number
    episodes_count: number
    lists_count: number
}

const Admin: React.FC = () => {
    usePageTitle('Trackist - Admin')
    const globalUser = useAuthStore((state) => state.user)
    const globalLoading = useAuthStore((state) => state.loading)
    const [profile, setProfile] = useState<{ role: string | null } | null>(null)
    const [adminLoading, setAdminLoading] = useState(true)
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
    const [editUserConfirm, setEditUserConfirm] = useState<{ userId: string; displayName: string; currentDisplayName: string } | null>(null)
    const [editUserLoading, setEditUserLoading] = useState(false)
    const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ userId: string; displayName: string } | null>(null)
    const [deleteUserLoading, setDeleteUserLoading] = useState(false)
    const [userStats, setUserStats] = useState<UserStats[]>([])
    const [userStatsLoading, setUserStatsLoading] = useState(false)
    const [avatarUploading, setAvatarUploading] = useState(false)
    const [avatarMessage, setAvatarMessage] = useState<{ userId: string; text: string; type: 'success' | 'error' } | null>(null)
    const [pendingAvatarUserId, setPendingAvatarUserId] = useState<string | null>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)

    if (adminLoading) return <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
    if (profile && profile.role !== "admin") return <Navigate to="/" replace />

    const isAdmin = profile?.role === "admin"

    const fetchAll = async <T,>(query: any): Promise<T[]> => {
        const allData: T[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
            const { data, error } = await query
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) {
                console.error('Supabase pagination error:', error)
                break
            }

            const batch = data as T[]
            if (batch.length === 0 || batch.length < pageSize) {
                hasMore = false
            } else {
                page++
            }

            allData.push(...batch)
        }

        return allData
    }

    useEffect(() => {
        if (globalLoading) return
        if (!globalUser) {
            setAdminLoading(false)
            setProfile({ role: 'user' })
            return
        }

        let isMounted = true
        const MAX_TIMEOUT = 10000

        const safetyTimeout = setTimeout(() => {
            if (isMounted && adminLoading) {
                console.warn('[Admin] Admin check timed out after 10s')
                setAdminLoading(false)
                setProfile({ role: 'user' })
            }
        }, MAX_TIMEOUT)

        const checkAdmin = async () => {
            try {
                if (!globalUser?.access_token) {
                    if (isMounted) {
                        setProfile({ role: 'user' })
                        setAdminLoading(false)
                    }
                    return
                }

                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 6000)

                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin`, {
                    headers: { 'Authorization': `Bearer ${globalUser.access_token}` },
                    signal: controller.signal
                })

                clearTimeout(timeoutId)

                if (!isMounted) return

                if (res.ok) {
                    const data = await res.json()
                    setProfile({ role: data.isAdmin ? 'admin' : 'user' })
                } else {
                    setProfile({ role: 'user' })
                }
            } catch (fetchError) {
                console.error('[Admin] verify-admin fetch failed:', fetchError)
                if (isMounted) setProfile({ role: 'user' })
            } finally {
                if (isMounted) {
                    clearTimeout(safetyTimeout)
                    setAdminLoading(false)
                }
            }
        }

        checkAdmin()

        return () => {
            isMounted = false
            clearTimeout(safetyTimeout)
        }
    }, [globalUser, globalLoading])

    useEffect(() => {
        if (!globalUser) return

        const fetchData = async () => {
            try {
                const profilesData = await fetchAll<ProfileRow>(
                    supabase
                        .from('profiles')
                        .select('id, display_name, avatar_url, role, created_at, updated_at')
                        .order('created_at', { ascending: false })
                )

                const sortedProfiles = (profilesData || []).sort((a, b) => {
                    if (a.role === 'admin' && b.role !== 'admin') return -1
                    if (a.role !== 'admin' && b.role === 'admin') return 1
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })

                setProfiles(sortedProfiles)

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

                const scoreData = await fetchAll<{ vote_average: number | null }>(
                    supabase
                        .from('watchlist')
                        .select('vote_average')
                        .not('vote_average', 'is', null)
                        .gt('vote_average', 0)
                )

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
    }, [isAdmin, globalUser])

    useEffect(() => {
        if (!isAdmin || !globalUser || activeTab !== 'user-stats') return

        const fetchUserStats = async () => {
            setUserStatsLoading(true)
            try {
                const profilesData = await fetchAll<{ id: string; display_name: string | null; role: string | null; created_at: string }>(
                    supabase
                        .from('profiles')
                        .select('id, display_name, role, created_at')
                )

                if (!profilesData || profilesData.length === 0) {
                    setUserStats([])
                    return
                }

                const watchlistData = await fetchAll<{ id: string; user_id: string; media_type: string; status: string }>(
                    supabase
                        .from('watchlist')
                        .select('id, user_id, media_type, status')
                )

                const episodesData = await fetchAll<{ watchlist_id: string }>(
                    supabase
                        .from('watchlist_episodes')
                        .select('watchlist_id')
                )

                const listsData = await fetchAll<{ user_id: string }>(
                    supabase
                        .from('lists')
                        .select('user_id')
                )

                const watchlistByUser = new Map<string, { total: number; movies: number; tv: number; completed: number }>()
                watchlistData?.forEach(item => {
                    const existing = watchlistByUser.get(item.user_id) || { total: 0, movies: 0, tv: 0, completed: 0 }
                    existing.total++
                    if (item.media_type === 'movie') existing.movies++
                    if (item.media_type === 'tv') existing.tv++
                    if (item.status === 'completed') existing.completed++
                    watchlistByUser.set(item.user_id, existing)
                })

                const watchlistIdToUserId = new Map<string, string>()
                watchlistData?.forEach(item => {
                    watchlistIdToUserId.set(item.id, item.user_id)
                })

                const episodesByUser = new Map<string, number>()
                let orphanedEpisodes = 0
                episodesData?.forEach(ep => {
                    const userId = watchlistIdToUserId.get(ep.watchlist_id)
                    if (userId) {
                        episodesByUser.set(userId, (episodesByUser.get(userId) || 0) + 1)
                    } else {
                        orphanedEpisodes++
                    }
                })

                const listsByUser = new Map<string, number>()
                listsData?.forEach(list => {
                    listsByUser.set(list.user_id, (listsByUser.get(list.user_id) || 0) + 1)
                })

                const stats: UserStats[] = profilesData.map(profile => {
                    const wl = watchlistByUser.get(profile.id) || { total: 0, movies: 0, tv: 0, completed: 0 }
                    return {
                        id: profile.id,
                        display_name: profile.display_name,
                        role: profile.role,
                        created_at: profile.created_at,
                        watchlist_count: wl.total,
                        movies_count: wl.movies,
                        tv_count: wl.tv,
                        completed_count: wl.completed,
                        episodes_count: episodesByUser.get(profile.id) || 0,
                        lists_count: listsByUser.get(profile.id) || 0
                    }
                }).sort((a, b) => {
                    if (a.role === 'admin' && b.role !== 'admin') return -1
                    if (a.role !== 'admin' && b.role === 'admin') return 1
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })

                setUserStats(stats)
            } catch (err) {
                console.error('Failed to fetch user stats:', err)
            } finally {
                setUserStatsLoading(false)
            }
        }

        fetchUserStats()
    }, [isAdmin, globalUser, activeTab])

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

    const handleEditUser = async () => {
        if (!editUserConfirm) return
        setEditUserLoading(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ display_name: editUserConfirm.displayName })
                .eq('id', editUserConfirm.userId)

            if (error) {
                console.error('Failed to update user:', error)
                alert('Failed to update user. Please try again.')
            } else {
                setProfiles(prev => prev.map(p => p.id === editUserConfirm.userId ? { ...p, display_name: editUserConfirm.displayName } : p))
            }
        } catch (err) {
            console.error('User update error:', err)
            alert('An unexpected error occurred.')
        } finally {
            setEditUserLoading(false)
            setEditUserConfirm(null)
        }
    }

    const handleDeleteUser = async () => {
        if (!deleteUserConfirm) return
        setDeleteUserLoading(true)
        try {
            const userId = deleteUserConfirm.userId

            const { data: watchlists } = await supabase
                .from('watchlist')
                .select('id')
                .eq('user_id', userId)

            if (watchlists && watchlists.length > 0) {
                const watchlistIds = watchlists.map(w => w.id)
                await supabase
                    .from('watchlist_episodes')
                    .delete()
                    .in('watchlist_id', watchlistIds)
            }

            await supabase
                .from('watchlist')
                .delete()
                .eq('user_id', userId)

            const { data: userLists } = await supabase
                .from('lists')
                .select('id')
                .eq('user_id', userId)

            if (userLists && userLists.length > 0) {
                const listIds = userLists.map(l => l.id)
                await supabase
                    .from('list_items')
                    .delete()
                    .in('list_id', listIds)
            }

            await supabase
                .from('lists')
                .delete()
                .eq('user_id', userId)

            await supabase
                .from('profiles')
                .delete()
                .eq('id', userId)

            setProfiles(prev => prev.filter(p => p.id !== userId))
        } catch (err) {
            console.error('Delete user error:', err)
            alert('An unexpected error occurred while deleting the user.')
        } finally {
            setDeleteUserLoading(false)
            setDeleteUserConfirm(null)
        }
    }

    const handleAvatarClick = (userId: string) => {
        if (avatarUploading) return
        setPendingAvatarUserId(userId)
        setAvatarMessage(null)
        avatarInputRef.current?.click()
    }

    const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !pendingAvatarUserId) return

        setAvatarUploading(true)
        setAvatarMessage(null)

        try {
            const { url, error } = await uploadAvatar(file, pendingAvatarUserId)

            if (error) {
                setAvatarMessage({ userId: pendingAvatarUserId, text: error, type: 'error' })
            } else if (url) {
                setProfiles(prev => prev.map(p => p.id === pendingAvatarUserId ? { ...p, avatar_url: url } : p))
                setAvatarMessage({ userId: pendingAvatarUserId, text: 'Avatar updated successfully', type: 'success' })
            }
        } catch {
            setAvatarMessage({ userId: pendingAvatarUserId, text: 'Failed to upload avatar', type: 'error' })
        } finally {
            setAvatarUploading(false)
            setPendingAvatarUserId(null)
            if (avatarInputRef.current) {
                avatarInputRef.current.value = ''
            }
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

    if (!isAdmin || !globalUser) {
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
                    <button
                        className={`admin-tab ${activeTab === 'user-stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('user-stats')}
                    >
                        User Stats
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
                        <div className="stats-hero-card stats-hero-card--teal">
                            <div className="stats-hero-card__icon"><i className="fas fa-play-circle"></i></div>
                            <div className="stats-hero-card__value">{stats.totalEpisodes.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Episodes</div>
                        </div>
                        <div className="stats-hero-card stats-hero-card--pink">
                            <div className="stats-hero-card__icon"><i className="fas fa-check-circle"></i></div>
                            <div className="stats-hero-card__value">{stats.totalCompleted.toLocaleString()}</div>
                            <div className="stats-hero-card__label">Completed</div>
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
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div
                                                        className="admin-avatar"
                                                        onClick={() => handleAvatarClick(profile.id)}
                                                        title="Click to change avatar"
                                                    >
                                                        {profile.avatar_url ? (
                                                            <img src={profile.avatar_url} alt={profile.display_name || 'User'} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                                        ) : (
                                                            <span>{(profile.display_name || '?')[0].toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    {profile.display_name || '—'}
                                                </div>
                                                {avatarMessage?.userId === profile.id && (
                                                    <div style={{
                                                        fontSize: '0.75rem',
                                                        marginTop: '0.25rem',
                                                        color: avatarMessage.type === 'success' ? '#68ffae' : '#ff6b6b'
                                                    }}>
                                                        {avatarMessage.text}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`admin-role-badge admin-role-badge--${profile.role || 'user'}`}>
                                                    {profile.role || 'user'}
                                                </span>
                                            </td>
                                            <td>{formatDate(profile.created_at)}</td>
                                            <td>{formatDate(profile.updated_at)}</td>
                                            <td>
                                                {profile.id !== globalUser.id && (
                                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                        <button
                                                            className="admin-action-btn"
                                                            onClick={() => setEditUserConfirm({
                                                                userId: profile.id,
                                                                displayName: profile.display_name || '',
                                                                currentDisplayName: profile.display_name || 'Unknown'
                                                            })}
                                                            title="Edit user"
                                                        >
                                                            <i className="fas fa-pen"></i>
                                                        </button>
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
                                                        <button
                                                            className="admin-action-btn admin-action-btn--danger"
                                                            onClick={() => setDeleteUserConfirm({
                                                                userId: profile.id,
                                                                displayName: profile.display_name || 'Unknown'
                                                            })}
                                                            title="Delete user"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div
                                                className="admin-avatar admin-avatar--sm"
                                                onClick={() => handleAvatarClick(profile.id)}
                                                title="Click to change avatar"
                                            >
                                                {profile.avatar_url ? (
                                                    <img src={profile.avatar_url} alt={profile.display_name || 'User'} />
                                                ) : (
                                                    <span>{(profile.display_name || '?')[0].toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div className="admin-user-card__name">{profile.display_name || '—'}</div>
                                        </div>
                                        <span className={`admin-role-badge admin-role-badge--${profile.role || 'user'}`}>
                                            {profile.role || 'user'}
                                        </span>
                                    </div>
                                    {avatarMessage?.userId === profile.id && (
                                        <div style={{
                                            fontSize: '0.75rem',
                                            margin: '0 0 0.5rem 1rem',
                                            color: avatarMessage.type === 'success' ? '#68ffae' : '#ff6b6b'
                                        }}>
                                            {avatarMessage.text}
                                        </div>
                                    )}
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
                                    {profile.id !== globalUser.id && (
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <button
                                                className="admin-user-card__action"
                                                onClick={() => setEditUserConfirm({
                                                    userId: profile.id,
                                                    displayName: profile.display_name || '',
                                                    currentDisplayName: profile.display_name || 'Unknown'
                                                })}
                                            >
                                                <i className="fas fa-pen"></i>
                                                Edit
                                            </button>
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
                                            <button
                                                className="admin-user-card__action admin-user-card__action--danger"
                                                onClick={() => setDeleteUserConfirm({
                                                    userId: profile.id,
                                                    displayName: profile.display_name || 'Unknown'
                                                })}
                                            >
                                                <i className="fas fa-trash"></i>
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {profiles.length === 0 && !statsLoading && (
                                <p className="stats-empty">No users found.</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'user-stats' && (
                    <div className="admin-users-panel">
                        {userStatsLoading ? (
                            <div className="discover-loading">
                                <div className="discover-spinner" />
                                <p>Loading user stats...</p>
                            </div>
                        ) : (
                            <div className="admin-users-table-wrap">
                                <table className="admin-users-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Watchlist</th>
                                            <th>Movies</th>
                                            <th>TV Shows</th>
                                            <th>Episodes</th>
                                            <th>Completed</th>
                                            <th>Lists</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {userStats.map(us => (
                                            <tr key={us.id}>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontWeight: 600 }}>{us.display_name || '—'}</span>
                                                        <span className={`admin-role-badge admin-role-badge--${us.role || 'user'}`} style={{ alignSelf: 'flex-start' }}>{us.role || 'user'}</span>
                                                    </div>
                                                </td>
                                                <td>{us.watchlist_count}</td>
                                                <td>{us.movies_count}</td>
                                                <td>{us.tv_count}</td>
                                                <td>{us.episodes_count}</td>
                                                <td>{us.completed_count}</td>
                                                <td>{us.lists_count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {userStats.length === 0 && !userStatsLoading && (
                                    <p className="stats-empty">No user stats found.</p>
                                )}
                            </div>
                        )}
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

            <ConfirmModal
                isOpen={!!editUserConfirm}
                title="Edit User Display Name"
                message={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span>Edit display name for "{editUserConfirm?.currentDisplayName}":</span>
                        <input
                            type="text"
                            value={editUserConfirm?.displayName || ''}
                            onChange={(e) => setEditUserConfirm(prev => prev ? { ...prev, displayName: e.target.value } : null)}
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                padding: '0.6rem 0.8rem',
                                color: 'var(--color-platinum)',
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                            autoFocus
                        />
                    </div>
                }
                onConfirm={handleEditUser}
                onCancel={() => setEditUserConfirm(null)}
                confirmText={editUserLoading ? 'Saving...' : 'Save'}
                confirmColor="success"
                disabled={editUserLoading || !(editUserConfirm?.displayName && editUserConfirm.displayName.trim().length > 0)}
                confirmLoading={editUserLoading}
            />
            

            <ConfirmModal
                isOpen={!!deleteUserConfirm}
                title="Delete User"
                message={`Are you sure you want to delete user "${deleteUserConfirm?.displayName}"? This will permanently remove their profile, watchlist, episodes, and lists. This action cannot be undone.`}
                onConfirm={handleDeleteUser}
                onCancel={() => setDeleteUserConfirm(null)}
                confirmText={deleteUserLoading ? 'Deleting...' : 'Delete'}
                confirmColor="danger"
                disabled={deleteUserLoading}
                confirmLoading={deleteUserLoading}
            />

            <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarFileChange}
            />
        </div>
    )
}

export default Admin





