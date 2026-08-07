import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getProfile } from '../services/profileService'

export const useShowStremioButton = () => {
    const [showStremioButton, setShowStremioButton] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadPreference = async () => {
            try {
                const { data } = await supabase.auth.getUser()
                if (data.user) {
                    const { data: profileData } = await getProfile(data.user.id)
                    setShowStremioButton(profileData?.show_stremio_button === true)
                }
            } catch (err) {
                console.error('Failed to load Stremio preference:', err)
            } finally {
                setLoading(false)
            }
        }
        loadPreference()
    }, [])

    return { showStremioButton, loading }
}
