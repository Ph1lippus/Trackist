import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { followUser, unfollowUser, isFollowing } from '../services/profileService'

interface ProfileUser {
    id: string
    display_name: string | null
    avatar_url: string | null
}

const FriendsPage: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<ProfileUser[]>([])
    const [followingStatus, setFollowingStatus] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const loadUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)
        }
        loadUser()
    }, [])

    const searchUsers = async (query: string) => {
        if (!query.trim() || !currentUser) {
            setSearchResults([])
            return
        }

        setLoading(true)
        const { data, error } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .ilike('display_name', `%${query}%`)
            .neq('id', currentUser.id)
            .limit(20)

        if (!error && data) {
            setSearchResults(data)
            // Check following status for each result
            const statusMap: Record<string, boolean> = {}
            for (const user of data) {
                statusMap[user.id] = await isFollowing(currentUser.id, user.id)
            }
            setFollowingStatus(statusMap)
        }
        setLoading(false)
    }

    const handleFollow = async (userId: string) => {
        if (!currentUser) return

        const currentlyFollowing = followingStatus[userId]
        if (currentlyFollowing) {
            await unfollowUser(currentUser.id, userId)
        } else {
            await followUser(currentUser.id, userId)
        }
        setFollowingStatus(prev => ({ ...prev, [userId]: !currentlyFollowing }))
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        void searchUsers(searchQuery)
    }

    return (
        <section className="friends-page">
            <div className="friends-container">
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Friends</h2>
                        <span>Find and follow other users</span>
                    </div>
                    
                    <form onSubmit={handleSearch}>
                        <div className="friends-search-wrap">
                            <input
                                type="text"
                                className="friends-search"
                                placeholder="Search users by display name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </form>
                </div>

                {loading && (
                    <div className="discover-loading">
                        <div className="discover-spinner"></div>
                        <p>Searching...</p>
                    </div>
                )}

                {!loading && searchResults.length > 0 && (
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
                                    className={`friend-card__follow-btn ${followingStatus[user.id] ? 'friend-card__follow-btn--following' : ''}`}
                                    onClick={() => handleFollow(user.id)}
                                >
                                    {followingStatus[user.id] ? 'Following' : 'Follow'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && searchQuery && searchResults.length === 0 && (
                    <div className="discover-empty">
                        <p>No users found matching "{searchQuery}"</p>
                    </div>
                )}

                {!searchQuery && !loading && (
                    <div className="discover-empty">
                        <p>Enter a display name to search for users</p>
                    </div>
                )}
            </div>
        </section>
    )
}

export default FriendsPage