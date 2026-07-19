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
    // Using update to sync any additional profile data that may need updating
    return supabase.from('profiles').update({}).eq('id', userId)
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

// Avatar upload function
export const uploadAvatar = async (file: File): Promise<{ url: string | null; error: string | null }> => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        return { url: null, error: 'File must be an image' }
    }

    // Validate file size (4MB max)
    if (file.size > 4 * 1024 * 1024) {
        return { url: null, error: 'Image must be smaller than 4MB' }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { url: null, error: 'Not authenticated' }

    // Generate unique filename with timestamp to avoid conflicts
    const fileExt = file.name.split('.').pop()
    const filePath = `${user.id}/${Date.now()}.${fileExt}`

    // Upload new file to Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

    if (uploadError) {
        // Check if it's an RLS error and provide clearer guidance
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('RLS') || uploadError.message?.includes('policy')) {
            return { url: null, error: 'Storage not configured. Please configure RLS policies for the avatars bucket in Supabase Dashboard.' }
        }
        return { url: null, error: uploadError.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    // Update profile with new avatar URL (use .update, not .upsert)
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id)

    if (updateError) return { url: null, error: updateError.message }

    return { url: urlData.publicUrl, error: null }
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