import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getProfile } from '../services/profileService'

export const useShowLetterboxButton = () => {
    const [showLetterboxButton, setShowLetterboxButton] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadPreference = async () => {
            try {
                const { data } = await supabase.auth.getUser()
                if (data.user) {
                    const { data: profileData } = await getProfile(data.user.id)
                    setShowLetterboxButton(profileData?.show_letterbox_button === true)
                }
            } catch (err) {
                console.error('Failed to load Letterbox preference:', err)
            } finally {
                setLoading(false)
            }
        }
        loadPreference()
    }, [])

    return { showLetterboxButton, loading }
}
