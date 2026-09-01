import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getProfile } from '../services/profileService'

export const useShowTmdbButton = () => {
    const [showTmdbButton, setShowTmdbButton] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadPreference = async () => {
            try {
                const { data } = await supabase.auth.getUser()
                if (data.user) {
                    const { data: profileData } = await getProfile(data.user.id)
                    setShowTmdbButton(profileData?.show_tmdb_button === true)
                }
            } catch (err) {
                console.error('Failed to load TMDB preference:', err)
            } finally {
                setLoading(false)
            }
        }
        loadPreference()
    }, [])

    return { showTmdbButton, loading }
}
