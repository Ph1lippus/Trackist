import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import {
    getProfile,
    getProfileByUsername,
    followUser,
    unfollowUser,
    isFollowing
} from '../services/profileService'
import type { User } from '@supabase/supabase-js'
import type { WatchlistItem, TMDBResult } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { VirtuosoGrid } from 'react-virtuoso'
import { useMobile } from '../contexts/useMobile'
import MediaCard from '../components/media/MediaCard'

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

type TabType = 'watching' | 'movies' | 'finished' | 'lists'

const ProfilePage: React.FC = () => {
    const { username } = useParams<{ username: string }>()
    usePageTitle('Trackist - Profile')
    const { isMobile } = useMobile()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [isFollowingUser, setIsFollowingUser] = useState(false)
    const [followLoading, setFollowLoading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
    const [userLists, setUserLists] = useState<UserList[]>([])
    const [activeTab, setActiveTab] = useState<TabType>('watching')

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

            try {
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
                    if (currentUser && currentUser.id !== targetUserId) {
                        const following = await isFollowing(currentUser.id, targetUserId)
                        setIsFollowingUser(following)
                    }

                    // Load watchlist
                    const { data: watchlistData, error: watchlistError } = await supabase
                        .from('watchlist')
                        .select('*')
                        .eq('user_id', targetUserId)
                        .order('added_at', { ascending: false })
                    
                    if (watchlistError) {
                        console.error('Failed to load watchlist for profile:', watchlistError)
                    }
                    
                    const items = (watchlistData || []) as WatchlistItem[]
                    setWatchlistItems(items)

                    // Load lists - query lists table directly and compute counts from list_items
                    const isOwn = currentUser?.id === targetUserId
                    let listsQuery = supabase
                        .from('lists')
                        .select('*')
                        .eq('user_id', targetUserId)
                        .order('updated_at', { ascending: false })

                    if (!isOwn) {
                        listsQuery = listsQuery.eq('is_public', true)
                    }

                    const { data: listsData } = await listsQuery
                    const rawLists = (listsData || []) as UserList[]

                    // Compute item counts from list_items
                    if (rawLists.length > 0) {
                        const listIds = rawLists.map(l => l.id)
                        const { data: listItems } = await supabase
                            .from('list_items')
                            .select('list_id, watched_at')
                            .in('list_id', listIds)

                        const counts: Record<string, { item_count: number; watched_count: number }> = {}
                        if (listItems) {
                            listItems.forEach(item => {
                                if (!counts[item.list_id]) {
                                    counts[item.list_id] = { item_count: 0, watched_count: 0 }
                                }
                                counts[item.list_id].item_count++
                                if (item.watched_at) counts[item.list_id].watched_count++
                            })
                        }

                        const listsWithCounts = rawLists.map(list => ({
                            ...list,
                            item_count: counts[list.id]?.item_count || 0,
                            watched_count: counts[list.id]?.watched_count || 0
                        }))

                        setUserLists(listsWithCounts)
                    } else {
                        setUserLists([])
                    }
                }
            } catch (error) {
                console.error('Failed to load profile:', error)
            } finally {
                setLoading(false)
            }
        }

        void loadProfile()
    }, [username, currentUser])

    const handleFollow = async () => {
        if (!currentUser || !profile) return

        setFollowLoading(true)

        if (isFollowingUser) {
            await unfollowUser(currentUser.id, profile.id)
        } else {
            await followUser(currentUser.id, profile.id)
        }

        setIsFollowingUser(!isFollowingUser)
        setFollowLoading(false)
    }

    const isOwnProfile = currentUser?.id === profile?.id

    const watchingTVShows = useMemo(() => watchlistItems.filter(item => 
        (item.media_type === 'tv' || item.media_type === 'anime') && item.status === 'watching'
    ), [watchlistItems])

    const moviesToWatch = useMemo(() => watchlistItems.filter(item => 
        item.media_type === 'movie' && item.status === 'planning'
    ), [watchlistItems])

    const finishedItems = useMemo(() => watchlistItems.filter(item => 
        item.status === 'completed' || item.status === 'caught_up'
    ), [watchlistItems])

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
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
                                    Joined {formatDate(profile.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="profile-tabs">
                    <button
                        className={`profile-tab ${activeTab === 'watching' ? 'active' : ''}`}
                        onClick={() => setActiveTab('watching')}
                    >
                        <i className="fa-solid fa-tv"></i>
                        Watching
                        <span className="profile-tab__count">{watchingTVShows.length}</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'movies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('movies')}
                    >
                        <i className="fa-solid fa-film"></i>
                        Movies
                        <span className="profile-tab__count">{moviesToWatch.length}</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'finished' ? 'active' : ''}`}
                        onClick={() => setActiveTab('finished')}
                    >
                        <i className="fa-solid fa-check-circle"></i>
                        Finished
                        <span className="profile-tab__count">{finishedItems.length}</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'lists' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lists')}
                    >
                        <i className="fa-solid fa-list"></i>
                        Lists
                        <span className="profile-tab__count">{userLists.length}</span>
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-tab-content">
                    {/* Watching Tab */}
                    {activeTab === 'watching' && (
                        <div className="profile-watchlist-section">
                            {watchingTVShows.length > 0 ? (
                                <div className="profile-watchlist-category">
                                    <VirtuosoGrid
                                        increaseViewportBy={{
                                            top: isMobile ? 600 : 1200,
                                            bottom: isMobile ? 2000 : 3000,
                                        }}
                                        computeItemKey={(index) => watchingTVShows[index]?.id ?? index}
                                        style={{ height: '100%', width: '100%' }}
                                        useWindowScroll={true}
                                        data={watchingTVShows}
                                        overscan={isMobile ? 800 : 1500}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = watchingTVShows[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type === 'anime' ? 'tv' : item.media_type
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={true}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <i className="fa-solid fa-tv profile-empty__icon"></i>
                                    <h3>Not watching anything yet</h3>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Movies Tab */}
                    {activeTab === 'movies' && (
                        <div className="profile-watchlist-section">
                            {moviesToWatch.length > 0 ? (
                                <div className="profile-watchlist-category">
                                    <VirtuosoGrid
                                        increaseViewportBy={{
                                            top: isMobile ? 600 : 1200,
                                            bottom: isMobile ? 2000 : 3000,
                                        }}
                                        computeItemKey={(index) => moviesToWatch[index]?.id ?? index}
                                        style={{ height: '100%', width: '100%' }}
                                        useWindowScroll={true}
                                        data={moviesToWatch}
                                        overscan={isMobile ? 800 : 1500}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = moviesToWatch[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: 'movie'
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={true}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <i className="fa-solid fa-film profile-empty__icon"></i>
                                    <h3>No movies to watch</h3>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Finished Tab */}
                    {activeTab === 'finished' && (
                        <div className="profile-watchlist-section">
                            {finishedItems.length > 0 ? (
                                <div className="profile-watchlist-category">
                                    <VirtuosoGrid
                                        increaseViewportBy={{
                                            top: isMobile ? 600 : 1200,
                                            bottom: isMobile ? 2000 : 3000,
                                        }}
                                        computeItemKey={(index) => finishedItems[index]?.id ?? index}
                                        style={{ height: '100%', width: '100%' }}
                                        useWindowScroll={true}
                                        data={finishedItems}
                                        overscan={isMobile ? 800 : 1500}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = finishedItems[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type === 'anime' ? 'tv' : item.media_type
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={true}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <i className="fa-solid fa-check-circle profile-empty__icon"></i>
                                    <h3>Nothing finished yet</h3>
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
                </div>
            </div>
        </section>
    )
}

export default ProfilePage