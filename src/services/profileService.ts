import { supabase } from './supabaseClient'

export const signInWithEmail = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
}

export const signOutUser = async () => {
    return supabase.auth.signOut()
}

export const requestPasswordReset = async (email: string) => {
    return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
    })
}

export const updateUserEmail = async (email: string) => {
    return supabase.auth.updateUser({ email })
}

export const updateLastActive = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return { data: null, error }
    }

    return supabase.auth.updateUser({
        data: {
            last_active: new Date().toISOString()
        }
    })
}

// Profile functions
export const checkDisplayNameExists = async (displayName: string) => {
    // Check if username already exists in profiles table
    const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', displayName)
        .single()
    return !!data
}

export const createProfile = async (userId: string) => {
    // The display_name is stored in auth metadata and synced to profiles via database trigger (on_auth_user_created)
    // Profile is automatically created by the trigger, but we keep this function for flexibility
    // Using upsert to handle case where trigger already created the profile
    return supabase.from('profiles').upsert({
        id: userId
    })
}

export const getProfile = async (userId: string) => {
    return supabase.from('profiles').select('*').eq('id', userId).single()
}

export const getProfileByUsername = async (username: string) => {
    return supabase.from('profiles').select('*').eq('display_name', username).single()
}

export const updateProfile = async (userId: string, updates: { display_name?: string; bio?: string; avatar_url?: string }) => {
    // Update auth metadata if display_name is being updated
    if (updates.display_name) {
        await supabase.auth.updateUser({
            data: { display_name: updates.display_name }
        })
    }
    return supabase.from('profiles').update(updates).eq('id', userId)
}

// Follow functions
export const followUser = async (followerId: string, followedId: string) => {
    return supabase.from('user_follows').insert({
        follower_id: followerId,
        followed_id: followedId
    })
}

export const unfollowUser = async (followerId: string, followedId: string) => {
    return supabase.from('user_follows').delete().eq('follower_id', followerId).eq('followed_id', followedId)
}

export const getFollowers = async (userId: string) => {
    const { count, error } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId)
    return { count, error }
}

export const getFollowing = async (userId: string) => {
    const { count, error } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    return { count, error }
}

export const isFollowing = async (followerId: string, followedId: string) => {
    const { data } = await supabase.from('user_follows').select('id').eq('follower_id', followerId).eq('followed_id', followedId).single()
    return !!data
}
