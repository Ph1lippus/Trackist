import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import {
    getProfile,
    getProfileByUsername,
    getFollowers,
    getFollowing,
    followUser,
    unfollowUser,
    isFollowing
} from '../services/profileService'
import type { User } from '@supabase/supabase-js'
import type { WatchlistItem } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDateString } from '../utils/dateUtils'

interface ProfileData {
    id: string
    display_name: string | null
    bio: string | null
    avatar_url: string | null
    created_at: string
    updated_at: string
}

interface UserList {
    id: string
    title: string
    description: string | null
    is_public: boolean
    item_count: number
    watched_count: number
    completed_at: string | null
}

type TabType = 'watchlist' | 'lists' | 'stats'
type StatusFilter = 'all' | 'planning' | 'watching' | 'completed' | 'caught_up' | 'dropped'

const STATUS_LABELS: Record<string, string> = {
    planning: 'Planning',
    watching: 'Watching',
    completed: 'Completed',
    caught_up: 'Caught Up',
    dropped: 'Dropped'
}

const STATUS_COLORS: Record<string, string> = {
    planning: '#888',
    watching: '#ffc107',
    completed: '#68ffae',
    caught_up: '#0096ff',
    dropped: '#f44336'
}

const ProfilePage: React.FC = () => {
    const { username } = useParams<{ username: string }>()
    usePageTitle('Trackist - Profile')
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowingUser, setIsFollowingUser] = useState(false)
    const [followLoading, setFollowLoading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
    const [userLists, setUserLists] = useState<UserList[]>([])
    const [activeTab, setActiveTab] = useState<TabType>('watchlist')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [stats, setStats] = useState({
        totalMovies: 0,
        totalTvShows: 0,
        totalCompleted: 0,
        totalWatching: 0,
        totalPlanning: 0,
        totalEpisodesWatched: 0,
        totalWatchTimeMinutes: 0
    })

    useEffect(() => {
        const loadUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)
        }
        void loadUser()
    }, [])

    useEffect(() => {
        if (!username && !currentUser) return

        const loadProfile = async () => {
            setLoading(true)

            let profileData: ProfileData | null = null
            let targetUserId: string | null = null

            if (username) {
                const { data } = await getProfileByUsername(username)
                profileData = data as ProfileData | null
                targetUserId = profileData?.id || null
            } else if (currentUser) {
                const { data } = await getProfile(currentUser.id)
                profileData = data as ProfileData | null
                targetUserId = currentUser.id
            }

            setProfile(profileData)

            if (targetUserId && profileData) {
                const { count: fCount } = await getFollowers(targetUserId)
                setFollowersCount(fCount || 0)

                const { count: fgCount } = await getFollowing(targetUserId)
                setFollowingCount(fgCount || 0)

                if (currentUser && currentUser.id !== targetUserId) {
                    const following = await isFollowing(currentUser.id, targetUserId)
                    setIsFollowingUser(following)
                }

                // Load watchlist
                const { data: watchlistData } = await supabase
                    .from('watchlist')
                    .select('*')
                    .eq('user_id', targetUserId)
                    .order('added_at', { ascending: false })
                const items = (watchlistData || []) as WatchlistItem[]
                setWatchlistItems(items)

                // Calculate stats
                const movies = items.filter(i => i.media_type === 'movie')
                const tvShows = items.filter(i => i.media_type === 'tv' || i.media_type === 'anime')
                setStats({
                    totalMovies: movies.length,
                    totalTvShows: tvShows.length,
                    totalCompleted: items.filter(i => i.status === 'completed').length,
                    totalWatching: items.filter(i => i.status === 'watching').length,
                    totalPlanning: items.filter(i => i.status === 'planning').length,
                    totalEpisodesWatched: 0,
                    totalWatchTimeMinutes: 0
                })

                // Try to fetch episode stats (only for own profile)
                if (currentUser && currentUser.id === targetUserId) {
                    try {
                        const { data: episodeStats } = await supabase.rpc('get_my_watch_statistics')
                        if (episodeStats && episodeStats.length > 0) {
                            setStats(prev => ({
                                ...prev,
                                totalEpisodesWatched: Number(episodeStats[0].total_episodes_watched),
                                totalWatchTimeMinutes: Number(episodeStats[0].total_watch_time_minutes)
                            }))
                        }
                    } catch {
                        // Ignore episode stats errors for other users
                    }
                }

                // Load lists - show all for own profile, only public for others
                const isOwn = currentUser?.id === targetUserId
                let listsQuery = supabase
                    .from('list_stats')
                    .select('*')
                    .eq('user_id', targetUserId)
                    .order('created_at', { ascending: false })

                if (!isOwn) {
                    listsQuery = listsQuery.eq('is_public', true)
                }

                const { data: listsData } = await listsQuery
                setUserLists(listsData || [])
            }

            setLoading(false)
        }

        void loadProfile()
    }, [username, currentUser])

    const handleFollow = async () => {
        if (!currentUser || !profile) return

        setFollowLoading(true)

        if (isFollowingUser) {
            await unfollowUser(currentUser.id, profile.id)
            setFollowersCount(prev => prev - 1)
        } else {
            await followUser(currentUser.id, profile.id)
            setFollowersCount(prev => prev + 1)
        }

        setIsFollowingUser(!isFollowingUser)
        setFollowLoading(false)
    }

    const isOwnProfile = currentUser?.id === profile?.id

    const filteredWatchlist = useMemo(() => {
        if (statusFilter === 'all') return watchlistItems
        return watchlistItems.filter(item => item.status === statusFilter)
    }, [watchlistItems, statusFilter])

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        watchlistItems.forEach(item => {
            counts[item.status] = (counts[item.status] || 0) + 1
        })
        return counts
    }, [watchlistItems])

    const formatMinutes = (minutes: number): string => {
        const days = Math.floor(minutes / 1440)
        const hours = Math.floor((minutes % 1440) / 60)
        const mins = minutes % 60
        const parts: string[] = []
        if (days > 0) parts.push(`${days}d`)
        if (hours > 0) parts.push(`${hours}h`)
        if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)
        return parts.join(' ')
    }

    const formatDate = (dateString: string): string => {
        return formatDateString(dateString, { year: 'numeric', month: 'long', day: 'numeric' })
    }

    if (loading) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading">
                        <div className="discover-spinner"></div>
                        <p>Loading profile...</p>
                    </div>
                </div>
            </section>
        )
    }

    if (!profile) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="profile-not-found">
                        <i className="fa-solid fa-user-slash profile-not-found__icon"></i>
                        <h2>User not found</h2>
                        <p>The profile you're looking for doesn't exist or has been removed.</p>
                        <Link to="/Discover" className="dashboard-link-btn">Back to Discover</Link>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className="dashboard-page profile-page">
            <div className="dashboard-shell">
                {/* Profile Hero */}
                <div className="profile-hero">
                    <div className="profile-hero__banner"></div>
                    <div className="profile-hero__content">
                        <div className="profile-hero__avatar-wrap">
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt={profile.display_name || 'User'}
                                    className="profile-hero__avatar"
                                />
                            ) : (
                                <div className="profile-hero__avatar profile-hero__avatar--placeholder">
                                    {(profile.display_name || 'U')[0].toUpperCase()}
                                </div>
                            )}
                        </div>

                        <div className="profile-hero__info">
                            <div className="profile-hero__header">
                                <div>
                                    <h1 className="profile-hero__name">
                                        {profile.display_name || 'Anonymous'}
                                    </h1>
                                    <p className="profile-hero__username">
                                        @{(profile.display_name || 'user').toLowerCase().replace(/\s+/g, '_')}
                                    </p>
                                </div>

                                <div className="profile-hero__actions">
                                    {isOwnProfile ? (
                                        <>
                                            <Link to="/EditProfile" className="profile-btn profile-btn--primary">
                                                <i className="fa-solid fa-pen"></i>
                                                Edit Profile
                                            </Link>
                                            <Link to="/Settings" className="profile-btn profile-btn--secondary">
                                                <i className="fa-solid fa-gear"></i>
                                                Settings
                                            </Link>
                                        </>
                                    ) : (
                                        currentUser && (
                                            <button
                                                className={`profile-btn ${isFollowingUser ? 'profile-btn--following' : 'profile-btn--primary'}`}
                                                onClick={handleFollow}
                                                disabled={followLoading}
                                            >
                                                {followLoading ? (
                                                    <><i className="fa-solid fa-spinner fa-spin"></i> Loading...</>
                                                ) : isFollowingUser ? (
                                                    <><i className="fa-solid fa-user-check"></i> Following</>
                                                ) : (
                                                    <><i className="fa-solid fa-user-plus"></i> Follow</>
                                                )}
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {profile.bio && (
                                <p className="profile-hero__bio">{profile.bio}</p>
                            )}

                            <div className="profile-hero__meta">
                                <span className="profile-hero__meta-item">
                                    <i className="fa-solid fa-calendar"></i>
                                    Joined {formatDate(profile.created_at)}
                                </span>
                            </div>

                            <div className="profile-hero__stats">
                                <div className="profile-stat">
                                    <span className="profile-stat__value">{watchlistItems.length}</span>
                                    <span className="profile-stat__label">Watchlist</span>
                                </div>
                                <div className="profile-stat">
                                    <span className="profile-stat__value">{followersCount}</span>
                                    <span className="profile-stat__label">Followers</span>
                                </div>
                                <div className="profile-stat">
                                    <span className="profile-stat__value">{followingCount}</span>
                                    <span className="profile-stat__label">Following</span>
                                </div>
                                <div className="profile-stat">
                                    <span className="profile-stat__value">{userLists.length}</span>
                                    <span className="profile-stat__label">Lists</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="profile-tabs">
                    <button
                        className={`profile-tab ${activeTab === 'watchlist' ? 'active' : ''}`}
                        onClick={() => setActiveTab('watchlist')}
                    >
                        <i className="fa-solid fa-film"></i>
                        Watchlist
                        <span className="profile-tab__count">{watchlistItems.length}</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'lists' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lists')}
                    >
                        <i className="fa-solid fa-list"></i>
                        Lists
                        <span className="profile-tab__count">{userLists.length}</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        <i className="fa-solid fa-chart-bar"></i>
                        Stats
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-tab-content">
                    {/* Watchlist Tab */}
                    {activeTab === 'watchlist' && (
                        <div className="profile-watchlist-section">
                            {/* Status Filters */}
                            {watchlistItems.length > 0 && (
                                <div className="profile-filters">
                                    <button
                                        className={`profile-filter ${statusFilter === 'all' ? 'active' : ''}`}
                                        onClick={() => setStatusFilter('all')}
                                    >
                                        All <span className="profile-filter__count">{watchlistItems.length}</span>
                                    </button>
                                    {Object.entries(STATUS_LABELS).map(([key, label]) => {
                                        const count = statusCounts[key] || 0
                                        if (count === 0) return null
                                        return (
                                            <button
                                                key={key}
                                                className={`profile-filter ${statusFilter === key ? 'active' : ''}`}
                                                onClick={() => setStatusFilter(key as StatusFilter)}
                                                style={statusFilter === key ? { background: STATUS_COLORS[key], borderColor: STATUS_COLORS[key] } : {}}
                                            >
                                                {label}
                                                <span className="profile-filter__count">{count}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {filteredWatchlist.length > 0 ? (
                                <div className="profile-watchlist-grid">
                                    {filteredWatchlist.map((item) => (
                                        <Link
                                            key={item.id}
                                            to={`/${item.media_type === 'movie' ? 'movie' : 'tv'}/${item.tmdb_id}`}
                                            className="profile-media-card"
                                        >
                                            <div className="profile-media-card__poster">
                                                {item.poster_path ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w300${item.poster_path}`}
                                                        alt={item.title}
                                                    />
                                                ) : (
                                                    <div className="profile-media-card__no-poster">
                                                        {item.title}
                                                    </div>
                                                )}
                                                <div
                                                    className="profile-media-card__status"
                                                    style={{ background: STATUS_COLORS[item.status] }}
                                                >
                                                    {STATUS_LABELS[item.status]}
                                                </div>
                                            </div>
                                            <div className="profile-media-card__body">
                                                <h3>{item.title}</h3>
                                                <span className="profile-media-card__type">
                                                    {item.media_type === 'movie' ? 'Movie' : item.media_type === 'anime' ? 'Anime' : 'TV Show'}
                                                </span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <i className="fa-solid fa-film profile-empty__icon"></i>
                                    <h3>{statusFilter === 'all' ? 'No items in watchlist' : `No ${STATUS_LABELS[statusFilter]} items`}</h3>
                                    {isOwnProfile && (
                                        <Link to="/Discover" className="dashboard-link-btn">Add some media</Link>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lists Tab */}
                    {activeTab === 'lists' && (
                        <div className="profile-lists-section">
                            {userLists.length > 0 ? (
                                <div className="profile-lists-grid">
                                    {userLists.map((list) => (
                                        <Link
                                            key={list.id}
                                            to={`/Profile/${profile.display_name || ''}/list/${list.id}`}
                                            className="profile-list-card"
                                        >
                                            <div className="profile-list-card__header">
                                                <h3 className="profile-list-card__title">{list.title}</h3>
                                                {!list.is_public && (
                                                    <span className="profile-list-card__badge profile-list-card__badge--private">
                                                        <i className="fa-solid fa-lock"></i> Private
                                                    </span>
                                                )}
                                                {list.is_public && (
                                                    <span className="profile-list-card__badge profile-list-card__badge--public">
                                                        <i className="fa-solid fa-globe"></i> Public
                                                    </span>
                                                )}
                                            </div>
                                            {list.description && (
                                                <p className="profile-list-card__desc">{list.description}</p>
                                            )}
                                            <div className="profile-list-card__stats">
                                                <span><i className="fa-solid fa-layer-group"></i> {list.item_count} items</span>
                                                <span><i className="fa-solid fa-check-circle"></i> {list.watched_count || 0} watched</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <i className="fa-solid fa-list profile-empty__icon"></i>
                                    <h3>No lists yet</h3>
                                    {isOwnProfile && (
                                        <Link to="/lists" className="dashboard-link-btn">Create a list</Link>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Stats Tab */}
                    {activeTab === 'stats' && (
                        <div className="profile-stats-section">
                            <div className="profile-stats-summary">
                                <div className="profile-stat-card">
                                    <span className="profile-stat-card__value">{stats.totalMovies}</span>
                                    <span className="profile-stat-card__label">Movies</span>
                                </div>
                                <div className="profile-stat-card">
                                    <span className="profile-stat-card__value">{stats.totalTvShows}</span>
                                    <span className="profile-stat-card__label">TV Shows</span>
                                </div>
                                <div className="profile-stat-card">
                                    <span className="profile-stat-card__value">{stats.totalCompleted}</span>
                                    <span className="profile-stat-card__label">Completed</span>
                                </div>
                                <div className="profile-stat-card">
                                    <span className="profile-stat-card__value">{stats.totalWatching}</span>
                                    <span className="profile-stat-card__label">Watching</span>
                                </div>
                                <div className="profile-stat-card">
                                    <span className="profile-stat-card__value">{stats.totalPlanning}</span>
                                    <span className="profile-stat-card__label">Planning</span>
                                </div>
                                {isOwnProfile && (
                                    <>
                                        <div className="profile-stat-card">
                                            <span className="profile-stat-card__value">{stats.totalEpisodesWatched.toLocaleString()}</span>
                                            <span className="profile-stat-card__label">Episodes</span>
                                        </div>
                                        <div className="profile-stat-card">
                                            <span className="profile-stat-card__value">{formatMinutes(stats.totalWatchTimeMinutes)}</span>
                                            <span className="profile-stat-card__label">Watch Time</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Status Breakdown */}
                            {watchlistItems.length > 0 && (
                                <div className="profile-stats-breakdown">
                                    <h3 className="profile-stats-breakdown__title">Status Breakdown</h3>
                                    {Object.entries(STATUS_LABELS).map(([key, label]) => {
                                        const count = statusCounts[key] || 0
                                        const percentage = watchlistItems.length > 0 ? (count / watchlistItems.length) * 100 : 0
                                        return (
                                            <div key={key} className="profile-breakdown-item">
                                                <div className="profile-breakdown-item__header">
                                                    <span className="profile-breakdown-item__label">{label}</span>
                                                    <span className="profile-breakdown-item__count">{count}</span>
                                                </div>
                                                <div className="profile-breakdown-bar">
                                                    <div
                                                        className="profile-breakdown-bar__fill"
                                                        style={{
                                                            width: `${percentage}%`,
                                                            background: `linear-gradient(90deg, ${STATUS_COLORS[key]}, ${STATUS_COLORS[key]}dd)`
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {isOwnProfile && (
                                <Link to="/Statistics" className="profile-stats-link">
                                    View Full Statistics
                                    <i className="fa-solid fa-arrow-right"></i>
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default ProfilePage