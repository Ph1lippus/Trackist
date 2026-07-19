import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getProfile, getProfileByUsername, getFollowers, getFollowing, followUser, unfollowUser, isFollowing } from '../services/profileService'
import type { User } from '@supabase/supabase-js'

interface Profile {
    id: string
    display_name: string | null
    bio: string | null
    avatar_url: string | null
    created_at: string
    updated_at: string
}

interface WatchlistItem {
    id: string
    tmdb_id: number
    media_type: 'movie' | 'tv' | 'anime'
    title: string
    poster_path: string | null
    status: string
}

interface List {
    id: string
    title: string
    description: string | null
    is_public: boolean
    item_count: number
    watched_count: number
    completed_at: string | null
}

const ProfilePage: React.FC = () => {
    const { username } = useParams<{ username: string }>()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowingUser, setIsFollowingUser] = useState(false)
    const [followLoading, setFollowLoading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
    const [userLists, setUserLists] = useState<List[]>([])

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
            
            let profileData: Profile | null = null
            let targetUserId: string | null = null

            // If username is provided, look up by username; otherwise use current user's ID
            if (username) {
                const { data } = await getProfileByUsername(username)
                profileData = data as Profile | null
                targetUserId = profileData?.id || null
            } else if (currentUser) {
                const { data } = await getProfile(currentUser.id)
                profileData = data as Profile | null
                targetUserId = currentUser.id
            }

            setProfile(profileData)

            if (targetUserId && profileData) {
                const { count: followersCount } = await getFollowers(targetUserId)
                setFollowersCount(followersCount || 0)

                const { count: followingCount } = await getFollowing(targetUserId)
                setFollowingCount(followingCount || 0)

                if (currentUser && currentUser.id !== targetUserId) {
                    const following = await isFollowing(currentUser.id, targetUserId)
                    setIsFollowingUser(following)
                }

                // Load watchlist
                const { data: watchlistData } = await supabase
                    .from('watchlist')
                    .select('id, tmdb_id, media_type, title, poster_path, status')
                    .eq('user_id', targetUserId)
                    .order('added_at', { ascending: false })
                    .limit(50)
                setWatchlistItems(watchlistData || [])

                // Load lists
                const { data: listsData } = await supabase
                    .from('list_stats')
                    .select('*')
                    .eq('user_id', targetUserId)
                    .eq('is_public', true)
                    .order('created_at', { ascending: false })
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
                    <div className="discover-empty">
                        Profile not found
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className="dashboard-page">
            <div className="dashboard-shell">
                <div className="discover-section">
                    <div className="profile-header" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1.5rem', position: 'relative' }}>
                        {isOwnProfile && (
                            <Link
                                to="/EditProfile"
                                className="dashboard-link-btn"
                                style={{ position: 'absolute', top: 0, right: 0 }}
                            >
                                Edit Profile
                            </Link>
                        )}
                        
                        <div className="profile-avatar" style={{ flexShrink: 0 }}>
                            {profile.avatar_url ? (
                                <img 
                                    src={profile.avatar_url} 
                                    alt={profile.display_name || 'User'} 
                                    style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                            ) : (
                                <div style={{ 
                                    width: '100px', 
                                    height: '100px', 
                                    borderRadius: '50%', 
                                    background: 'var(--color-orange)', 
                                    color: 'var(--color-black)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '2rem',
                                    fontWeight: '700'
                                }}>
                                    {(profile.display_name || 'U')[0].toUpperCase()}
                                </div>
                            )}
                        </div>

                        <div className="profile-info" style={{ flex: 1 }}>
                            <h2 style={{ color: 'var(--color-platinum)', marginBottom: '0.5rem', fontSize: '1.5rem' }}>
                                {profile.display_name || 'Anonymous'}
                            </h2>
                            
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                @{profile.display_name?.toLowerCase().replace(/\s+/g, '_') || 'user'}
                            </p>

                            {profile.bio && (
                                <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1rem', lineHeight: 1.6 }}>
                                    {profile.bio}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <strong style={{ color: 'var(--color-platinum)' }}>{watchlistItems.length}</strong>
                                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.25rem' }}>watchlist</span>
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--color-platinum)' }}>{followersCount}</strong>
                                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.25rem' }}>followers</span>
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--color-platinum)' }}>{followingCount}</strong>
                                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.25rem' }}>following</span>
                                </div>
                            </div>

                            {!isOwnProfile && currentUser && (
                                <button 
                                    className="btn btn-primary"
                                    onClick={handleFollow}
                                    disabled={followLoading}
                                    style={{ 
                                        padding: '0.5rem 1.5rem',
                                        borderRadius: '50px',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {followLoading ? 'Loading...' : (isFollowingUser ? 'Unfollow' : 'Follow')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2 style={{ margin: 0 }}>Watchlist</h2>
                        <span>Media tracked by this user</span>
                    </div>
                    
                    {watchlistItems.length > 0 ? (
                        <div className="profile-watchlist-grid">
                            {watchlistItems.map((item) => (
                                <div key={item.id} className="discover-card">
                                    <div className="discover-card__poster">
                                        {item.poster_path ? (
                                            <img 
                                                src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} 
                                                alt={item.title} 
                                            />
                                        ) : (
                                            <div className="discover-card__no-poster">
                                                {item.title}
                                            </div>
                                        )}
                                    </div>
                                    <div className="discover-card__body">
                                        <h3>{item.title}</h3>
                                        <span className="discover-card__type">{item.media_type === 'movie' ? 'Movie' : 'TV Show'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="discover-empty" style={{ padding: '2rem' }}>
                            No items in watchlist yet
                        </div>
                    )}
                </div>

                <div className="discover-section profile-lists-section">
                    <div className="discover-section__head">
                        <h2 style={{ margin: 0 }}>Lists</h2>
                        <span>Collections created by this user</span>
                    </div>
                    
                    {userLists.length > 0 ? (
                        <div className="profile-lists-grid">
                            {userLists.map((list) => (
                                <Link 
                                    key={list.id} 
                                    to={`/Profile/${profile.display_name || ''}/list/${list.id}`} 
                                    className="profile-list-card"
                                >
                                    <h3 className="profile-list-card__title">{list.title}</h3>
                                    {list.description && (
                                        <p className="profile-list-card__desc">{list.description}</p>
                                    )}
                                    <div className="profile-list-card__stats">
                                        {list.item_count} items &bull; {list.watched_count || 0} watched
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="discover-empty" style={{ padding: '2rem' }}>
                            No public lists yet
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default ProfilePage