import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useAuthStore } from '../stores/useAuthStore'
import { getProfileByUsername, getProfile, getFollowingList, followUser, unfollowUser } from '../services/profileService'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'
import { cacheService, getCachedOrFetch } from '../services/cacheService'

const FollowingPage = () => {
    usePageTitle('Trackist - Following')
    const { username } = useParams<{ username: string }>()
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [targetUser, setTargetUser] = useState<any>(null)
    const [following, setFollowing] = useState<any[]>([])
    const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({})
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const authUser = useAuthStore((state) => state.user)
    const authLoading = useAuthStore((state) => state.loading)
    const { committedQuery } = useSearch()

    useEffect(() => {
        let active = true
        const load = async () => {
            try {
                if (authLoading) return
                const user = authUser
                if (!user || !active) return

                setCurrentUser(user)

                let targetUserId = user.id
                if (username) {
                    const profileData = await getCachedOrFetch(
                        'profile',
                        username,
                        async () => (await getProfileByUsername(username)).data,
                        { ttl: 15 * 60 * 1000, staleWhileRevalidate: true }
                    )
                    if (profileData && active) {
                        setTargetUser(profileData)
                        targetUserId = profileData.id
                    }
                }

                const followingData = await getCachedOrFetch(
                    'following',
                    targetUserId,
                    async () => (await getFollowingList(targetUserId)).data || [],
                    { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }
                )
                if (followingData && active) {
                    setFollowing(followingData)
                }
            } catch (error) {
                console.error('Error loading data:', error)
            } finally {
                if (active && !authLoading) setIsLoading(false)
            }
        }
        load()
        return () => {
            active = false
        }
    }, [username, authUser, authLoading])

    useEffect(() => {
        const searchUsers = async () => {
            if (!committedQuery.trim() || !currentUser) {
                setSearchResults([])
                setIsSearching(false)
                return
            }

            setIsSearching(true)
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url')
                .ilike('display_name', `%${committedQuery}%`)
                .neq('id', currentUser.id)
                .limit(20)

            if (!error && data) {
                const { data: follows } = await supabase
                    .from('user_follows')
                    .select('followed_id')
                    .eq('follower_id', currentUser.id)
                    .in('followed_id', data.map(u => u.id))

                const followingSet = new Set(follows?.map(f => f.followed_id) ?? [])

                const resultsWithStatus = data.map(user => ({
                    ...user,
                    is_following: followingSet.has(user.id)
                }))
                setSearchResults(resultsWithStatus)
            }
            setIsSearching(false)
        }

        searchUsers()
    }, [committedQuery, currentUser])

    const followingSet = useMemo(() => {
        if (!currentUser) return new Set<string>()
        return new Set(following.map(f => f.id))
    }, [following, currentUser])

    const handleFollow = useCallback(async (userId: string) => {
        if (!currentUser) return

        setFollowLoading(prev => ({ ...prev, [userId]: true }))

        const isCurrentlyFollowing = followingSet.has(userId)

        if (isCurrentlyFollowing) {
            await unfollowUser(currentUser.id, userId)
            await cacheService.clearPattern('following')
            setFollowing(prev => prev.filter(f => f.id !== userId))
            
        } else {
            await followUser(currentUser.id, userId)
            await cacheService.clearPattern('following')
            const { data } = await getProfile(userId)
            if (data) {
                setFollowing(prev => [...prev, data])
                
            }
        }

        setFollowLoading(prev => ({ ...prev, [userId]: false }))
    }, [currentUser, followingSet])

    const displayName = targetUser?.display_name || 'your'

    return (
        <section className="friends-page">
            <div className="friends-container">
                {isSearching && (
                    <div className="discover-section" style={{ marginBottom: '2rem' }}>
                        <div className="discover-section__head">
                            <h2>Search Results</h2>
                        </div>
                        <div className="discover-loading">
                            <div className="discover-spinner"></div>
                            <p>Searching...</p>
                        </div>
                    </div>
                )}

                {!isSearching && searchResults.length > 0 && (
                    <div className="discover-section" style={{ marginBottom: '2rem' }}>
                        <div className="discover-section__head">
                            <h2>Search Results</h2>
                            <span>{searchResults.length} {searchResults.length === 1 ? 'user' : 'users'}</span>
                        </div>
                        <div className="friends-results">
                            {searchResults.map((user) => (
                                <div key={user.id} className="friend-card">
                                    <Link
                                        to={`/Profile/${user.display_name}`}
                                        className="friend-card__avatar"
                                    >
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt={user.display_name || 'User'} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                        ) : (
                                            <div className="friend-card__avatar-placeholder">
                                                {(user.display_name || 'U')[0].toUpperCase()}
                                            </div>
                                        )}
                                    </Link>

                                    <div className="friend-card__info">
                                        <Link
                                            to={`/Profile/${user.display_name}`}
                                            className="friend-card__name"
                                        >
                                            {user.display_name || 'Anonymous'}
                                        </Link>
                                    </div>

                                    <button
                                        className={`friend-card__follow-btn ${user.is_following ? 'friend-card__follow-btn--following' : ''}`}
                                        onClick={() => handleFollow(user.id)}
                                    >
                                        {user.is_following ? 'Following' : 'Follow'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="discover-loading" aria-live="polite">
                        <div className="discover-spinner"></div>
                        <p>Loading following...</p>
                    </div>
                ) : following.length > 0 ? (
                    <div className="friends-results">
                        {following.map((user) => (
                            <div key={user.id} className="friend-card">
                                <Link
                                    to={`/Profile/${user.display_name}`}
                                    className="friend-card__avatar"
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.display_name || 'User'} />
                                    ) : (
                                        <div className="friend-card__avatar-placeholder">
                                            {(user.display_name || 'U')[0].toUpperCase()}
                                        </div>
                                    )}
                                </Link>

                                <div className="friend-card__info">
                                    <Link
                                        to={`/Profile/${user.display_name}`}
                                        className="friend-card__name"
                                    >
                                        {user.display_name || 'Anonymous'}
                                    </Link>
                                </div>

                                {currentUser && currentUser.id !== user.id && (
                                    <button
                                        className={`friend-card__follow-btn ${followingSet.has(user.id) ? 'friend-card__follow-btn--following' : ''}`}
                                        onClick={() => handleFollow(user.id)}
                                        disabled={!!followLoading[user.id]}
                                    >
                                        {followLoading[user.id] ? 'Loading...' : followingSet.has(user.id) ? 'Following' : 'Follow'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="discover-empty">
                        <i className="fa-solid fa-users-slash" style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '1rem' }}></i>
                        <p>{targetUser ? `${displayName} isn't following anyone yet.` : "You're not following anyone yet. Use the search bar to find users."}</p>
                    </div>
                )}
            </div>
        </section>
    )
}

export default FollowingPage

