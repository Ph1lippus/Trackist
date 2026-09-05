import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import {
    getProfile,
    getProfileByUsername,
    getFollowers,
    getFollowing,
    followUser,
    unfollowUser,
    isFollowing
} from '../services/profileService'
import { useAuthStore } from '../stores/useAuthStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { WatchlistItem, TMDBResult } from '../types'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import { cacheService, getCachedOrFetch } from '../services/cacheService'
import { imageUrl } from '../services/tmdbService'
import { VirtuosoGrid } from 'react-virtuoso'
import { useMobile } from '../contexts/useMobile'
import MediaCard from '../components/media/MediaCard'
import ConfirmModal from '../components/modals/ConfirmModal'
import ShareButton from '../components/media/ShareButton'

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
    poster?: string | null
}

type TabType = 'watching' | 'movies' | 'finished' | 'lists'

const ProfilePage: React.FC = () => {
    const { username } = useParams<{ username: string }>()
    usePageTitle('Track1st - Profile')
    const { isMobile } = useMobile()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [listsCount, setListsCount] = useState(0)
    const [isFollowingUser, setIsFollowingUser] = useState(false)
    const [followLoading, setFollowLoading] = useState(false)
    const [showUnfollowModal, setShowUnfollowModal] = useState(false)
    const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
    const [userLists, setUserLists] = useState<UserList[]>([])
    const [isProfileDataLoaded, setIsProfileDataLoaded] = useState(false)
    const [isProfileContentLoaded, setIsProfileContentLoaded] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('watching')
    const [currentUserWatchlistIds, setCurrentUserWatchlistIds] = useState<Set<number>>(new Set())
    const libraryWatchlistIds = useLibraryStore((state) => state.watchlistIds)
    const isLibraryInitialized = useLibraryStore((state) => state.isInitialized)
    const { showIcons } = useMediaCardIcons()

    useEffect(() => {
        const loadUser = async () => {
            const user = useAuthStore.getState().user
            setCurrentUser(user)
        }
        void loadUser()
    }, [])

    useEffect(() => {
        const fetchCurrentUserWatchlist = async () => {
            if (!currentUser) {
                setCurrentUserWatchlistIds(new Set())
                return
            }

            if (isLibraryInitialized) {
                setCurrentUserWatchlistIds(new Set(libraryWatchlistIds))
                return
            }

            const { data } = await supabase
                .from('watchlist')
                .select('tmdb_id')
                .eq('user_id', currentUser.id)

            if (data) {
                const ids = new Set(data.map(item => item.tmdb_id).filter((id): id is number => id != null))
                setCurrentUserWatchlistIds(ids)
            } else {
                setCurrentUserWatchlistIds(new Set())
            }
        }

        void fetchCurrentUserWatchlist()
    }, [currentUser, isLibraryInitialized, libraryWatchlistIds])

    useEffect(() => {
        if (!username && !currentUser) return

        let active = true
        setProfile(null)
        setIsProfileDataLoaded(false)
        setIsProfileContentLoaded(false)

        const loadProfile = async () => {
            try {
                let profileData: ProfileData | null = null
                let targetUserId: string | null = null

                if (username) {
                    const cacheKey = `profile:${username}`
                    profileData = await getCachedOrFetch(
                        cacheKey,
                        username,
                        async () => {
                            const { data } = await getProfileByUsername(username)
                            return data as ProfileData | null
                        },
                        { ttl: 15 * 60 * 1000, staleWhileRevalidate: true }
                    )
                    targetUserId = profileData?.id || null
                } else if (currentUser) {
                    const cacheKey = `profile:${currentUser.id}`
                    profileData = await getCachedOrFetch(
                        cacheKey,
                        currentUser.id,
                        async () => {
                            const { data } = await getProfile(currentUser.id)
                            return data as ProfileData | null
                        },
                        { ttl: 15 * 60 * 1000, staleWhileRevalidate: true }
                    )
                    targetUserId = currentUser.id
                }

                if (!active) return
                setProfile(profileData)
                // Let the profile header render while secondary profile data loads.
                setIsProfileDataLoaded(true)

                if (targetUserId && profileData) {
                    if (currentUser && currentUser.id !== targetUserId) {
                        const following = await isFollowing(currentUser.id, targetUserId)
                        setIsFollowingUser(following)
                    }

                    const isOwn = currentUser?.id === targetUserId
                    const ownLibraryItems = isOwn && useLibraryStore.getState().isInitialized
                        ? useLibraryStore.getState().allItems
                        : null
                    const [{ count: followersCountData }, { count: followingCountData }, items, listsWithCounts] = await Promise.all([
                        getFollowers(targetUserId),
                        getFollowing(targetUserId),
                        ownLibraryItems || getCachedOrFetch(
                            'profile-watchlist',
                            targetUserId,
                            async () => fetchProfileWatchlistItems(targetUserId),
                            { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }
                        ),
                        getCachedOrFetch(
                            'profile-lists',
                            `${targetUserId}:${isOwn ? 'own' : 'public'}`,
                            async () => {
                                let listsQuery = supabase
                                    .from('lists')
                                    .select('*')
                                    .eq('user_id', targetUserId)
                                    .order('updated_at', { ascending: false })

                                if (!isOwn) listsQuery = listsQuery.eq('is_public', true)

                                const { data: listsData, error: listsError } = await listsQuery
                                if (listsError) throw listsError
                                const rawLists = (listsData || []) as UserList[]
                                if (rawLists.length === 0) return []

                                const { data: listItems, error: listItemsError } = await supabase
                                    .from('list_items')
                                    .select('list_id, watched_at, poster_path')
                                    .in('list_id', rawLists.map(list => list.id))
                                if (listItemsError) throw listItemsError

                                const counts: Record<string, { item_count: number; watched_count: number }> = {}
                                const posterMap: Record<string, string | null> = {}
                                for (const item of listItems || []) {
                                    counts[item.list_id] ??= { item_count: 0, watched_count: 0 }
                                    counts[item.list_id].item_count++
                                    if (item.watched_at) counts[item.list_id].watched_count++
                                    if (!posterMap[item.list_id] && item.poster_path) {
                                        posterMap[item.list_id] = item.poster_path
                                    }
                                }
                                return rawLists.map(list => ({
                                    ...list,
                                    item_count: counts[list.id]?.item_count || 0,
                                    watched_count: counts[list.id]?.watched_count || 0,
                                    poster: posterMap[list.id] || null
                                }))
                            },
                            { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }
                        )
                    ])
                    if (!active) return
                    setFollowersCount(followersCountData || 0)
                    setFollowingCount(followingCountData || 0)
                    setListsCount(listsWithCounts.length || 0)
                    setWatchlistItems(items)
                    setUserLists(listsWithCounts)
                    setIsProfileContentLoaded(true)
                }
            } catch (error) {
                console.error('[Profile] Failed to load profile:', error)
            } finally {
                if (active) {
                    setIsProfileDataLoaded(true)
                    setIsProfileContentLoaded(true)
                }
            }
        }

        void loadProfile()
        return () => {
            active = false
        }
    }, [username, currentUser])

    const handleFollow = async () => {
        if (!currentUser || !profile) return

        if (isFollowingUser) {
            setShowUnfollowModal(true)
        } else {
            setFollowLoading(true)
            await followUser(currentUser.id, profile.id)
            setIsFollowingUser(true)
            setFollowLoading(false)
        }
    }

    const confirmUnfollow = async () => {
        if (!currentUser || !profile) return

        setFollowLoading(true)
        await unfollowUser(currentUser.id, profile.id)
        setIsFollowingUser(false)
        setShowUnfollowModal(false)
        setFollowLoading(false)
    }

    const isOwnProfile = currentUser?.id === profile?.id
    const profileIdentifier = profile?.display_name || username || ''
    const profileShareUrl = profileIdentifier
        ? new URL(`/Profile/${encodeURIComponent(profileIdentifier)}`, window.location.origin).toString()
        : new URL('/Profile', window.location.origin).toString()

    const fetchProfileWatchlistItems = async (userId: string): Promise<WatchlistItem[]> => {
        const allItems: WatchlistItem[] = []
        const pageSize = 1000
        let page = 0

        while (true) {
            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', userId)
                .order('added_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) throw error
            if (!data || data.length === 0) break

            allItems.push(...(data as WatchlistItem[]))
            if (data.length < pageSize) break
            page += 1
        }

        return allItems
    }

    const handleAddToWatchlist = async (tmdbItem: TMDBResult) => {
        if (!currentUser) return

        const tmdbId = tmdbItem.id as number
        const isInWatchlist = currentUserWatchlistIds.has(tmdbId)

        if (isInWatchlist) {
            const libraryItem = useLibraryStore.getState().allItems.find(item => item.tmdb_id === tmdbId)
            if (libraryItem) {
                await useLibraryStore.getState().removeItem(libraryItem.id)
                await cacheService.clearPattern('profile-watchlist')
                setCurrentUserWatchlistIds(prev => {
                    const next = new Set(prev)
                    next.delete(tmdbId)
                    return next
                })
            }
        } else {
            const newItem: WatchlistItem = {
                id: crypto.randomUUID(),
                user_id: currentUser.id,
                media_type: tmdbItem.media_type === 'person' ? 'movie' : (tmdbItem.media_type as 'movie' | 'tv'),
                tmdb_id: tmdbId,
                title: tmdbItem.title || tmdbItem.name || '',
                poster_path: tmdbItem.poster_path || undefined,
                overview: tmdbItem.overview || undefined,
                release_date: tmdbItem.release_date || tmdbItem.first_air_date || undefined,
                vote_average: tmdbItem.vote_average || undefined,
                status: 'planning',
                added_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }
            await useLibraryStore.getState().addItem(newItem)
            await cacheService.clearPattern('profile-watchlist')
            setCurrentUserWatchlistIds(prev => new Set(prev).add(tmdbId))
        }
    }

    const watchingTVShows = useMemo(() => watchlistItems.filter(item =>
        item.media_type === 'tv' && item.status === 'watching'
    ), [watchlistItems])

    const moviesToWatch = useMemo(() => watchlistItems.filter(item =>
        item.media_type === 'movie' && item.status === 'planning'
    ), [watchlistItems])

    const finishedItems = useMemo(() => watchlistItems.filter(item =>
        item.status === 'completed' || item.status === 'caught_up'
    ), [watchlistItems])

    const droppedItems = useMemo(() => watchlistItems.filter(item =>
        item.status === 'dropped'
    ), [watchlistItems])

    if (!isProfileDataLoaded) {
        return <section className="dashboard-page profile-page" />
    }

    if (!profile) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="profile-not-found">
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
                        <div className="profile-hero__top-row">
                            <div className="profile-hero__avatar-wrap">
                                {profile.avatar_url ? (
                                    <img
                                        src={profile.avatar_url}
                                        alt={profile.display_name || 'User'}
                                        className="profile-hero__avatar"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                ) : (
                                    <div className="profile-hero__avatar profile-hero__avatar--placeholder">
                                        {(profile.display_name || 'U')[0].toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="profile-hero__info">
                                <div className="profile-hero__identity">
                                    <h1 className="profile-hero__name">
                                        {profile.display_name || 'Anonymous'}
                                    </h1>
                                </div>

                                <div className="profile-hero__stats">
                                    <Link to={`/Followers/${profile.display_name}`} className="profile-stat profile-stat--link">
                                        <span className="profile-stat__value">{followersCount}</span>
                                        <span className="profile-stat__label">followers</span>
                                    </Link>
                                    <Link to={`/Following/${profile.display_name}`} className="profile-stat profile-stat--link">
                                        <span className="profile-stat__value">{followingCount}</span>
                                        <span className="profile-stat__label">following</span>
                                    </Link>
                                    <div className="profile-stat" aria-label={`${listsCount} lists`}>
                                        <span className="profile-stat__value">{listsCount}</span>
                                        <span className="profile-stat__label">lists</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {profile.bio && (
                            <p className="profile-hero__bio">{profile.bio}</p>
                        )}

                        <div className="profile-hero__actions">
                            {!isOwnProfile && currentUser ? (
                                <button
                                    className="profile-btn"
                                    onClick={handleFollow}
                                    disabled={followLoading}
                                >
                                    {followLoading ? (
                                        <>Loading...</>
                                    ) : isFollowingUser ? (
                                        <>Following</>
                                    ) : (
                                        <>Follow</>
                                    )}
                                </button>
                            ) : isOwnProfile ? (
                                <Link to="/EditProfile" className="profile-btn">
                                    Edit Profile
                                </Link>
                            ) : null}
                            <ShareButton
                                url={profileShareUrl}
                                title={`${profile.display_name || 'User'} on Track1st`}
                                text={`Meet ${profile.display_name || 'this Track1st user'} and see what they are watching.`}
                                className="profile-btn"
                                label="Share Profile"
                                showIcon={false}
                            />
                            {isOwnProfile && (
                                <Link
                                    to="/Statistics"
                                    className="profile-btn profile-btn--icon"
                                    aria-label="Statistics"
                                    title="Statistics"
                                >
                                    <i className="fa-solid fa-chart-simple"></i>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="profile-tabs">
                    <button
                        className={`profile-tab ${activeTab === 'watching' ? 'active' : ''}`}
                        onClick={() => setActiveTab('watching')}
                    >
                        <span className="profile-tab__text">Watching</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'movies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('movies')}
                    >
                        <span className="profile-tab__text">Movies</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'finished' ? 'active' : ''}`}
                        onClick={() => setActiveTab('finished')}
                    >
                        <span className="profile-tab__text">Finished</span>
                    </button>
                    <button
                        className={`profile-tab ${activeTab === 'lists' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lists')}
                    >
                        <span className="profile-tab__text">Lists</span>
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-tab-content">
                    {!isProfileContentLoaded ? (
                        <div className="discover-loading" aria-live="polite">
                            <div className="discover-spinner" />
                            <p>Loading profile content...</p>
                        </div>
                    ) : (
                    <>
                    {/* Watching Tab */}
                    {activeTab === 'watching' && (
                        <div className="profile-watchlist-section">
                            {watchingTVShows.length > 0 ? (
                                <div className="profile-watchlist-category">
                                    <VirtuosoGrid
                                        increaseViewportBy={{
                                            top: isMobile ? 200 : 400,
                                            bottom: isMobile ? 120 : 240,
                                        }}
                                        computeItemKey={(index) => watchingTVShows[index]?.id ?? index}
                                        style={{ width: '100%' }}
                                        useWindowScroll={true}
                                        data={watchingTVShows}
                                        overscan={isMobile ? 10 : 20}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = watchingTVShows[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={currentUserWatchlistIds.has(tmdbItem.id)}
                                                    onAdd={handleAddToWatchlist}
                                                    hideAddButton={isOwnProfile}
                                                    showIcons={showIcons}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
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
                                            top: isMobile ? 200 : 400,
                                            bottom: isMobile ? 120 : 240,
                                        }}
                                        computeItemKey={(index) => moviesToWatch[index]?.id ?? index}
                                        style={{ width: '100%' }}
                                        useWindowScroll={true}
                                        data={moviesToWatch}
                                        overscan={isMobile ? 10 : 20}
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
                                                    isInWatchlist={currentUserWatchlistIds.has(tmdbItem.id)}
                                                    onAdd={handleAddToWatchlist}
                                                    hideAddButton={isOwnProfile}
                                                    showIcons={showIcons}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
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
                                            top: isMobile ? 200 : 400,
                                            bottom: isMobile ? 120 : 240,
                                        }}
                                        computeItemKey={(index) => finishedItems[index]?.id ?? index}
                                        style={{ width: '100%' }}
                                        useWindowScroll={true}
                                        data={finishedItems}
                                        overscan={isMobile ? 10 : 20}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = finishedItems[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={currentUserWatchlistIds.has(tmdbItem.id)}
                                                    onAdd={handleAddToWatchlist}
                                                    hideAddButton={isOwnProfile}
                                                    showIcons={showIcons}
                                                />
                                            )
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <h3>Nothing finished yet</h3>
                                </div>
                            )}

                            {droppedItems.length > 0 && (
                                <div className="profile-watchlist-category profile-watchlist-category--dropped">
                                    <h4 className="profile-watchlist-category__title">
                                        Dropped
                                    </h4>
                                    <VirtuosoGrid
                                        increaseViewportBy={{
                                            top: isMobile ? 200 : 400,
                                            bottom: isMobile ? 120 : 240,
                                        }}
                                        computeItemKey={(index) => droppedItems[index]?.id ?? index}
                                        style={{ width: '100%' }}
                                        useWindowScroll={true}
                                        data={droppedItems}
                                        overscan={isMobile ? 10 : 20}
                                        listClassName="discover-grid"
                                        itemContent={(index) => {
                                            const item = droppedItems[index]
                                            const tmdbItem: TMDBResult = {
                                                id: item.tmdb_id as number,
                                                title: item.title,
                                                poster_path: item.poster_path,
                                                media_type: item.media_type
                                            }
                                            return (
                                                <MediaCard
                                                    item={tmdbItem}
                                                    isInWatchlist={currentUserWatchlistIds.has(tmdbItem.id)}
                                                    onAdd={handleAddToWatchlist}
                                                    hideAddButton={isOwnProfile}
                                                    showIcons={showIcons}
                                                />
                                            )
                                        }}
                                    />
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
                                            to={`/ListsDetail/${list.id}`}
                                            className="lists-page__card"
                                        >
                                            <div className="media-card__poster list">
                                                {list.poster ? (
                                                    <img src={imageUrl(list.poster, 'w342') ?? undefined} alt={list.title} />
                                                ) : (
                                                    <div className="lists-page__card-placeholder">
                                                    </div>
                                                )}
                                            </div>
                                            <div className="lists-page__card-content">
                                                <h3>{list.title}</h3>
                                                {list.description && <p>{list.description}</p>}
                                                <div className="lists-page__card-meta">
                                                    <span>{list.item_count} items</span>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="profile-empty">
                                    <h3>No lists yet</h3>
                                    {isOwnProfile && (
                                        <Link to="/lists" className="dashboard-link-btn">Create a list</Link>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    </>
                    )}
                </div>

                {/* Unfollow Confirmation Modal */}
                {showUnfollowModal && (
                    <ConfirmModal
                        isOpen={showUnfollowModal}
                        title="Unfollow User"
                        message={`Are you sure you want to unfollow ${profile.display_name || 'this user'}?`}
                        onConfirm={confirmUnfollow}
                        onCancel={() => setShowUnfollowModal(false)}
                        confirmText="Unfollow"
                        confirmColor="danger"
                        disabled={followLoading}
                        confirmLoading={followLoading}
                    />
                )}
            </div>
        </section>
    )
}

export default ProfilePage
