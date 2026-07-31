import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getFollowingList, getUserLists, getProfile, followUser, unfollowUser, isFollowing } from '../services/profileService'
import { useSearch } from '../hooks/useSearch'

const FriendsPage = () => {
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [following, setFollowing] = useState<any[]>([])
    const [lists, setLists] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const { searchInputValue } = useSearch()

    const loadUserAndFollowing = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            
            setCurrentUser(user)
            
            // Load following list
            const { data: followingData } = await getFollowingList(user.id)
            if (followingData) {
                setFollowing(followingData)
            }
            
            // Load user's lists
            const { data: listsData } = await getUserLists(user.id)
            if (listsData) {
                setLists(listsData)
            }
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadUserAndFollowing()
    }, [loadUserAndFollowing])

    // Listen to search query changes from navbar
    useEffect(() => {
        const searchUsers = async () => {
            if (!searchInputValue.trim() || !currentUser) {
                setSearchResults([])
                setIsSearching(false)
                return
            }

            setIsSearching(true)
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url')
                .ilike('display_name', `%${searchInputValue}%`)
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

        // Use a debounce timer
        const timer = setTimeout(() => {
            searchUsers()
        }, 300)

        return () => clearTimeout(timer)
    }, [searchInputValue, currentUser])

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
                            <p>You're not following anyone yet. Use the search bar to find users.</p>
                        </div>
                    )}
                </div>

                {/* Lists Section */}
                <div className="discover-section" style={{ marginTop: '2rem' }}>
                    <div className="discover-section__head">
                        <h2>Your Lists</h2>
                        <span>{lists.length} {lists.length === 1 ? 'list' : 'lists'}</span>
                    </div>
                    
                    {lists.length > 0 ? (
                        <div className="friends-results">
                            {lists.map((list) => (
                                <Link 
                                    key={list.id} 
                                    to={`/Lists/${list.id}`}
                                    className="friend-card"
                                >
                                    <div className="friend-card__info" style={{ flex: 1 }}>
                                        <div className="friend-card__name">{list.title}</div>
                                        {list.description && (
                                            <div style={{ 
                                                fontSize: '0.85rem', 
                                                color: 'rgba(255, 255, 255, 0.5)',
                                                marginTop: '0.25rem'
                                            }}>
                                                {list.description}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.75rem',
                                        color: 'rgba(255, 255, 255, 0.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="discover-empty">
                            <p>You don't have any lists yet. Create lists to organize your media.</p>
                        </div>
                    )}
                </div>

                {/* Search Results (shown when searching) */}
                {isSearching && (
                    <div className="discover-section" style={{ marginTop: '2rem' }}>
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
                    <div className="discover-section" style={{ marginTop: '2rem' }}>
                        <div className="discover-section__head">
                            <h2>Search Results</h2>
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
            </div>
        </section>
    )
}

export default FriendsPage