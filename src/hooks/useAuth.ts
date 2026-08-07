import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { getProfile } from '../services/profileService'

interface Profile {
    id: string
    display_name: string | null
    role?: string | null
    bio?: string | null
    avatar_url?: string | null
    created_at?: string
    updated_at?: string
}

export const useAuth = (loadProfileData = false) => {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [initializing, setInitializing] = useState(true)

    const loadProfile = useCallback(async (userId: string) => {
        const { data, error } = await getProfile(userId)
        if (error) {
            console.error('useAuth: failed to load profile', error)
            setProfile(null)
        } else {
            setProfile(data as Profile | null)
        }
    }, [])

    useEffect(() => {
        let active = true
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!active) return
            setUser(session?.user || null)
            setInitializing(false)
            if (session?.user && loadProfileData) {
                loadProfile(session.user.id)
            }
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!active) return
            setUser(session?.user || null)
            setInitializing(false)
            if (session?.user && loadProfileData) {
                loadProfile(session.user.id)
            }
        })
        return () => {
            active = false
            subscription.unsubscribe()
        }
    }, [loadProfile, loadProfileData])

    return { user, profile, initializing }
}
