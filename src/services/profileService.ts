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
