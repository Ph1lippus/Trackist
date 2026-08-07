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

export const updateProfile = async (userId: string, updates: { display_name?: string; bio?: string; avatar_url?: string; show_stremio_button?: boolean }) => {
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

export const getFollowingList = async (followerId: string) => {
    // Step 1: Fetch the followed user IDs
    const { data: follows, error } = await supabase
        .from('user_follows')
        .select('followed_id')
        .eq('follower_id', followerId)

    if (error || !follows) return { data: null, error }

    const followedIds = follows.map(f => f.followed_id)
    if (followedIds.length === 0) return { data: [], error: null }

    // Step 2: Fetch the profiles for those IDs.
    // Note: We query profiles directly instead of joining through user_follows,
    // because user_follows.followed_id -> auth.users is a cross-schema FK and
    // PostgREST cannot reliably resolve an indirect profiles relationship.
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', followedIds)

    if (profilesError) return { data: null, error: profilesError }

    return { data: profiles || [], error: null }
}

// List functions
export const getUserLists = async (userId: string) => {
    const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
    
    return { data, error }
}

export const getListItems = async (listId: string) => {
    const { data, error } = await supabase
        .from('list_items')
        .select('*')
        .eq('list_id', listId)
        .order('added_at', { ascending: false })
    
    return { data, error }
}

export const createList = async (userId: string, title: string, description?: string, isPublic?: boolean) => {
    return supabase
        .from('lists')
        .insert({
            user_id: userId,
            title,
            description,
            is_public: isPublic ?? false
        })
        .select()
        .single()
}

export const deleteList = async (listId: string) => {
    return supabase
        .from('lists')
        .delete()
        .eq('id', listId)
}

export const reorderListItem = async (listId: string, itemId: string, newPosition: number) => {
    return supabase
        .from('list_items')
        .update({ position: newPosition })
        .eq('id', itemId)
        .eq('list_id', listId)
}

export const swapListItems = async (listId: string, itemId1: string, itemId2: string) => {
    // Get both items
    const { data: items } = await supabase
        .from('list_items')
        .select('id, position')
        .in('id', [itemId1, itemId2])
        .eq('list_id', listId)
    
    if (items && items.length === 2) {
        const item1 = items.find(i => i.id === itemId1)
        const item2 = items.find(i => i.id === itemId2)
        
        if (item1 && item2) {
            // Swap positions
            await supabase
                .from('list_items')
                .update({ position: item2.position })
                .eq('id', itemId1)
            
            await supabase
                .from('list_items')
                .update({ position: item1.position })
                .eq('id', itemId2)
        }
    }
}

export const updateList = async (listId: string, updates: { title?: string; description?: string; is_public?: boolean }) => {
    return supabase
        .from('lists')
        .update(updates)
        .eq('id', listId)
}

export const addToList = async (listId: string, item: {
    media_type: 'movie' | 'tv' | 'anime'
    tmdb_id: number
    title: string
    poster_path?: string
    overview?: string
    vote_average?: number
}) => {
    return supabase
        .from('list_items')
        .insert({
            list_id: listId,
            ...item
        })
}

export const removeFromList = async (listId: string, tmdbId: number) => {
    return supabase
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .eq('tmdb_id', tmdbId)
}
