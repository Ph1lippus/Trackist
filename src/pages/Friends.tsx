import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getFollowingList, getProfile, followUser, unfollowUser, isFollowing } from '../services/profileService'
import { useSearch } from '../hooks/useSearch'
import { usePageTitle } from '../hooks/usePageTitle'

const FriendsPage = () => {
    usePageTitle('Trackist - Friends')
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [following, setFollowing] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const { committedQuery } = useSearch()

    useEffect(() => {
        let active = true
        const load = async () => {
            try {
                // Yield to the microtask queue so setState calls happen after an await,
                // satisfying the react-hooks/set-state-in-effect rule.
                await Promise.resolve()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || !active) return
                
                setCurrentUser(user)
                
                // Load following list
                const { data: followingData } = await getFollowingList(user.id)
                if (followingData && active) {
                    setFollowing(followingData)
                }
            } catch (error) {
                console.error('Error loading data:', error)
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }
        load()
        return () => {
            active = false
        }
    }, [])

    // Listen to search query changes from navbar (committed = min 3 chars, 250ms debounced)
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
                // Check following status for each result
                const resultsWithStatus = await Promise.all(
                    data.map(async (user) => ({
                        ...user,
                        is_following: await isFollowing(currentUser.id, user.id)
                    }))
                )
                setSearchResults(resultsWithStatus)
            }
            setIsSearching(false)
        }

        searchUsers()
    }, [committedQuery, currentUser])

    const handleFollow = async (userId: string) => {
        if (!currentUser) return

        const isCurrentlyFollowing = following.some(f => f.id === userId)
        
        if (isCurrentlyFollowing) {
            await unfollowUser(currentUser.id, userId)
            setFollowing(prev => prev.filter(f => f.id !== userId))
        } else {
            await followUser(currentUser.id, userId)
            // Add to following list
            const { data } = await getProfile(userId)
            if (data) {
                setFollowing(prev => [...prev, data])
            }
        }
    }

    if (loading) {
        return (
            <section className="friends-page">
                <div className="friends-container">
                    <div className="discover-loading">
                        <div className="discover-spinner"></div>
                        <p>Loading...</p>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className="friends-page">
            <div className="friends-container">
                {/* Search Results (shown when searching) */}
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

                {/* Following Section */}
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Following</h2>
                        <span>{following.length} {following.length === 1 ? 'person' : 'people'}</span>
                    </div>
                    
                    {following.length > 0 ? (
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

                                    <button
                                        className="friend-card__follow-btn friend-card__follow-btn--following"
                                        onClick={() => handleFollow(user.id)}
                                    >
                                        Following
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="discover-empty">
                            <i className="fa-solid fa-users-slash" style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '1rem' }}></i>
                            <p>You're not following anyone yet. Use the search bar to find users.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default FriendsPage