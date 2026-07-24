import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { getProfile } from '../services/profileService'

/**
 * Shared auth hook that manages user session and optionally profile data.
 * Used by Navbar (with profile) and SecondaryNavbar (user only).
 */
export const useAuth = (loadProfileData = false) => {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<{ display_name: string | null } | null>(null)

    const loadProfile = useCallback(async (userId: string) => {
        const { data } = await getProfile(userId)
        setProfile(data)
    }, [])

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null)
            if (session?.user && loadProfileData) {
                loadProfile(session.user.id)
            }
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null)
            if (session?.user && loadProfileData) {
                loadProfile(session.user.id)
            }
        })
        return () => subscription.unsubscribe()
    }, [loadProfile, loadProfileData])

    return { user, profile }
}
