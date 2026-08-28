import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { requestPasswordReset, updateUserEmail, getProfile, updateProfile } from '../services/profileService'
import { useCache } from '../hooks/useCache'
import { getCachedOrFetch } from '../services/cacheService'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { validateDisplayName, validateEmail } from '../utils/validation'
import { getUTCTodayString } from '../utils/dateUtils'
import { useAuthStore } from '../stores/useAuthStore'

type SettingsSection = 'account' | 'profile' | 'security' | 'notifications' | 'data' | 'additions' | 'danger'
type NotificationPrefField = 'notify_new_episode' | 'notify_new_season' | 'notify_release_date'

const escapeCSV = (value: unknown): string => {
    const str = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
}

const rowsToCSV = (rows: Record<string, unknown>[]): string => {
    if (rows.length === 0) return ''
    const headers = Object.keys(rows[0])
    const lines = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => headers.map(header => escapeCSV(row[header])).join(','))
    ]
    return lines.join('\n')
}

const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

const notificationPrefs: { id: NotificationPrefField; label: string; desc: string }[] = [
    { id: 'notify_new_episode', label: 'New Episode Alerts', desc: 'Get notified when shows you\u2019re watching release new episodes' },
    { id: 'notify_new_season', label: 'New Season Alerts', desc: 'Get notified when shows you\u2019ve caught up on get new seasons' },
    { id: 'notify_release_date', label: 'Release Day Alerts', desc: 'Get notified when movies on your watchlist are released today' }
]

const Settings: React.FC = () => {
    usePageTitle('Trackist - Settings')
    const navigate = useNavigate()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [activeSection, setActiveSection] = useState<SettingsSection>('account')

    // Account states
    const [email, setEmail] = useState('')
    const [emailLoading, setEmailLoading] = useState(false)
    const [resetLoading, setResetLoading] = useState(false)
    const [accountMessage, setAccountMessage] = useState('')
    const [accountError, setAccountError] = useState('')

    // Profile states
    const [displayName, setDisplayName] = useState('')
    const [bio, setBio] = useState('')
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileMessage, setProfileMessage] = useState('')
    const [profileError, setProfileError] = useState('')

    // Notifications states
    const push = usePushNotifications()
    const [notifPrefs, setNotifPrefs] = useState<Record<NotificationPrefField, boolean>>({
        notify_new_episode: true,
        notify_new_season: true,
        notify_release_date: true
    })
    const [notifLoading, setNotifLoading] = useState<Record<NotificationPrefField, boolean>>({
        notify_new_episode: false,
        notify_new_season: false,
        notify_release_date: false
    })
    const [notifMessage, setNotifMessage] = useState<Partial<Record<NotificationPrefField, { text: string; isError: boolean }>>>({})
    const [pushMessage, setPushMessage] = useState('')

    // Data states
    const { stats: cacheStats, clearCache, isClearing } = useCache()
    const { canInstall, isPWA, install } = usePWAInstall()
    const [exportLoading, setExportLoading] = useState(false)
    const [exportCsvLoading, setExportCsvLoading] = useState(false)
    const [dataMessage, setDataMessage] = useState('')

    // Additions states
    const [showStremioButton, setShowStremioButton] = useState(false)
    const [showLetterboxButton, setShowLetterboxButton] = useState(false)
    const { showIcons: showMediaCardIcons, setShowIcons: setShowMediaCardIcons } = useMediaCardIcons()
    const [additionsLoading, setAdditionsLoading] = useState(false)
    const [additionsMessage, setAdditionsMessage] = useState('')
    const [letterboxLoading, setLetterboxLoading] = useState(false)
    const [letterboxMessage, setLetterboxMessage] = useState('')
    const [iconsLoading, setIconsLoading] = useState(false)
    const [iconsMessage, setIconsMessage] = useState('')

    // Danger zone
    const [deleteConfirm, setDeleteConfirm] = useState('')
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState('')

    useEffect(() => {
        const loadSettings = async () => {
            const user = useAuthStore.getState().user
            setCurrentUser(user)

            if (user) {
                setEmail(user.email || '')

                const cacheKey = `profile:${user.id}`
                const profileData = await getCachedOrFetch(
                    cacheKey,
                    user.id,
                    async () => {
                        const { data } = await getProfile(user.id)
                        return data
                    },
                    { ttl: 15 * 60 * 1000, staleWhileRevalidate: true }
                )

                if (profileData) {
                    setDisplayName(profileData.display_name || '')
                    setBio(profileData.bio || '')
                    setShowStremioButton(profileData.show_stremio_button === true)
                    setShowLetterboxButton(profileData.show_letterbox_button === true)
                    setShowMediaCardIcons(profileData.show_media_card_icons === true)
                    setNotifPrefs({
                        notify_new_episode: profileData.notify_new_episode !== false,
                        notify_new_season: profileData.notify_new_season !== false,
                        notify_release_date: profileData.notify_release_date !== false
                    })
                }
            }
        }

        void loadSettings()
    }, [])

    const handleEmailUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setAccountError('')
        setAccountMessage('')

        const emailError = validateEmail(email)
        if (emailError) {
            setAccountError(emailError)
            return
        }

        setEmailLoading(true)

        const { error } = await updateUserEmail(email.trim().toLowerCase())

        setEmailLoading(false)

        if (error) {
            setAccountError(error.message)
            return
        }

        setAccountMessage('A confirmation link has been sent to your new email address.')
    }

    const handlePasswordReset = async () => {
        if (!email) {
            setAccountError('Please provide an email address first')
            return
        }

        setAccountError('')
        setAccountMessage('')
        setResetLoading(true)

        const { error } = await requestPasswordReset(email.trim().toLowerCase())

        setResetLoading(false)

        if (error) {
            setAccountError(error.message)
            return
        }

        setAccountMessage('A password reset link has been sent to your email.')
    }

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setProfileError('')
        setProfileMessage('')

        if (!currentUser) return

        const nameError = validateDisplayName(displayName)
        if (nameError) {
            setProfileError(nameError)
            return
        }

        if (bio.length > 200) {
            setProfileError('Bio must be 200 characters or less')
            return
        }

        setProfileLoading(true)

        const { error } = await updateProfile(currentUser.id, {
            display_name: displayName,
            bio: bio
        })

        setProfileLoading(false)

        if (error) {
            setProfileError(error.message)
            return
        }

        setProfileMessage('Profile updated successfully')
    }

    const handleNotificationPrefUpdate = async (field: NotificationPrefField) => {
        if (!currentUser) return
        setNotifLoading(prev => ({ ...prev, [field]: true }))
        setNotifMessage(prev => ({ ...prev, [field]: '' }))

        const { error } = await updateProfile(currentUser.id, {
            [field]: !notifPrefs[field]
        })

        setNotifLoading(prev => ({ ...prev, [field]: false }))

        if (error) {
            setNotifMessage(prev => ({ ...prev, [field]: { text: error.message, isError: true } }))
            return
        }

        setNotifPrefs(prev => ({ ...prev, [field]: !prev[field] }))
        setNotifMessage(prev => ({ ...prev, [field]: { text: 'Preference updated successfully', isError: false } }))
    }

    const handleExportData = async () => {
        if (!currentUser) return

        setExportLoading(true)
        setDataMessage('')

        try {
            const { data: watchlist } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', currentUser.id)

            const { data: lists } = await supabase
                .from('lists')
                .select('*')
                .eq('user_id', currentUser.id)

            const { data: follows } = await supabase
                .from('user_follows')
                .select('*')
                .eq('follower_id', currentUser.id)

            const exportData = {
                exported_at: new Date().toISOString(),
                user: {
                    email: currentUser.email,
                    display_name: displayName,
                    bio: bio
                },
                watchlist: watchlist || [],
                lists: lists || [],
                following: follows || []
            }

            downloadBlob(JSON.stringify(exportData, null, 2), `trackist-export-${getUTCTodayString()}.json`, 'application/json')

            setDataMessage('Data exported successfully')
        } catch {
            setDataMessage('Failed to export data')
        }

        setExportLoading(false)
    }

    const handleExportCSV = async () => {
        if (!currentUser) return

        setExportCsvLoading(true)
        setDataMessage('')

        try {
            const { data: watchlist } = await supabase
                .from('watchlist')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('added_at', { ascending: false })

            const rows = (watchlist || []).map(item => ({
                title: item.title,
                media_type: item.media_type,
                status: item.status,
                tmdb_id: item.tmdb_id ?? '',
                current_season: item.current_season,
                current_episode: item.current_episode,
                total_seasons: item.total_seasons,
                total_episodes: item.total_episodes,
                release_date: item.release_date ?? '',
                added_at: item.added_at
            }))

            downloadBlob(rowsToCSV(rows), `trackist-watchlist-${getUTCTodayString()}.csv`, 'text/csv;charset=utf-8')

            setDataMessage('Watchlist exported as CSV successfully')
        } catch {
            setDataMessage('Failed to export data')
        }

        setExportCsvLoading(false)
    }

    const handleDeleteAccount = async () => {
        setDeleteError('')

        if (deleteConfirm !== 'DELETE') {
            setDeleteError('Please type DELETE to confirm')
            return
        }

        if (!currentUser) return

        setDeleteLoading(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error('No session')

            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete account')
            }

            await supabase.auth.signOut()
            navigate('/login')
        } catch {
            setDeleteError('Failed to delete account. Please contact support.')
        }

        setDeleteLoading(false)
    }

    const handleAdditionsUpdate = async () => {
        if (!currentUser) return
        setAdditionsLoading(true)
        setAdditionsMessage('')

        const { error } = await updateProfile(currentUser.id, {
            show_stremio_button: !showStremioButton
        })

        setAdditionsLoading(false)

        if (error) {
            setAdditionsMessage(error.message)
            return
        }

        setShowStremioButton(prev => !prev)
        setAdditionsMessage('Preference updated successfully')
    }

    const handleLetterboxUpdate = async () => {
        if (!currentUser) return
        setLetterboxLoading(true)
        setLetterboxMessage('')

        const { error } = await updateProfile(currentUser.id, {
            show_letterbox_button: !showLetterboxButton
        })

        setLetterboxLoading(false)

        if (error) {
            setLetterboxMessage(error.message)
            return
        }

        setShowLetterboxButton(prev => !prev)
        setLetterboxMessage('Preference updated successfully')
    }

    const handleMediaCardIconsUpdate = async () => {
        if (!currentUser) return
        setIconsLoading(true)
        setIconsMessage('')

        const newValue = !showMediaCardIcons
        setShowMediaCardIcons(newValue)

        const { error } = await updateProfile(currentUser.id, {
            show_media_card_icons: newValue
        })

        setIconsLoading(false)

        if (error) {
            setShowMediaCardIcons(!newValue)
            setIconsMessage(error.message)
            return
        }

        setIconsMessage('Preference updated successfully')
    }

    const handleEnablePush = async () => {
        const result = await push.enable()
        setPushMessage(result.ok ? 'Notifications enabled on this device' : (result.error || 'Failed to enable notifications'))
    }

    const handleDisablePush = async () => {
        const result = await push.disable()
        setPushMessage(result.ok ? 'Notifications disabled on this device' : (result.error || 'Failed to disable notifications'))
    }

    const sections: { id: SettingsSection; label: string; icon: string }[] = [
        { id: 'account', label: 'Account', icon: 'fa-user-shield' },
        { id: 'profile', label: 'Profile', icon: 'fa-id-card' },
        { id: 'security', label: 'Security', icon: 'fa-shield-halved' },
        { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
        { id: 'data', label: 'Data & Cache', icon: 'fa-database' },
        { id: 'additions', label: 'Additions', icon: 'fa-puzzle-piece' },
        { id: 'danger', label: 'Danger Zone', icon: 'fa-triangle-exclamation' }
    ]

    return (
        <section className="dashboard-page settings-page">
            <div className="dashboard-shell">
                <div className="discover-section">
                    <div className="discover-section__head">
                        <h2>Settings</h2>
                        <span>Manage your account and preferences</span>
                    </div>
                </div>

                <div className="settings-layout">
                    <aside className="settings-sidebar">
                        {sections.map(section => (
                            <button
                                key={section.id}
                                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''} ${section.id === 'danger' ? 'settings-nav-item--danger' : ''}`}
                                onClick={() => setActiveSection(section.id)}
                            >
                                <i className={`fa-solid ${section.icon}`}></i>
                                <span>{section.label}</span>
                            </button>
                        ))}
                    </aside>

                    <div className="settings-content">
                        {activeSection === 'account' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Account</h3>
                                    <p>Manage your email and password</p>
                                </div>

                                <form className="settings-form" onSubmit={handleEmailUpdate}>
                                    <div className="settings-field">
                                        <label className="settings-field__label">Email Address</label>
                                        <input
                                            className="settings-field__input"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter your new email"
                                        />
                                        <span className="settings-field__hint">Changing your email requires confirmation via a link sent to the new address.</span>
                                    </div>

                                    {accountError && <div className="settings-alert settings-alert--error">{accountError}</div>}
                                    {accountMessage && <div className="settings-alert settings-alert--success">{accountMessage}</div>}

                                    <button className="settings-btn settings-btn--primary" type="submit" disabled={emailLoading}>
                                        {emailLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Sending...</> : <><i className="fa-solid fa-envelope"></i> Change Email</>}
                                    </button>
                                </form>

                                <div className="settings-divider"></div>

                                <div className="settings-form">
                                    <div className="settings-field">
                                        <label className="settings-field__label">Password</label>
                                        <span className="settings-field__hint">Need to change your password? We'll send a reset link to your email.</span>
                                    </div>

                                    <button className="settings-btn settings-btn--secondary" type="button" onClick={handlePasswordReset} disabled={resetLoading}>
                                        {resetLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Sending...</> : <><i className="fa-solid fa-key"></i> Send Password Reset Link</>}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeSection === 'profile' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Profile</h3>
                                    <p>Update your display name and bio</p>
                                </div>

                                <form className="settings-form" onSubmit={handleProfileUpdate}>
                                    <div className="settings-field">
                                        <label className="settings-field__label">Display Name</label>
                                        <input
                                            className="settings-field__input"
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            placeholder="Your display name"
                                            maxLength={50}
                                        />
                                        <span className="settings-field__hint">{displayName.length}/50 characters</span>
                                    </div>

                                    <div className="settings-field">
                                        <label className="settings-field__label">Bio</label>
                                        <textarea
                                            className="settings-field__input settings-field__textarea"
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value)}
                                            placeholder="Tell us about yourself..."
                                            maxLength={200}
                                            rows={4}
                                        />
                                        <span className="settings-field__hint">{bio.length}/200 characters</span>
                                    </div>

                                    {profileError && <div className="settings-alert settings-alert--error">{profileError}</div>}
                                    {profileMessage && <div className="settings-alert settings-alert--success">{profileMessage}</div>}

                                    <button className="settings-btn settings-btn--primary" type="submit" disabled={profileLoading}>
                                        {profileLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving...</> : <><i className="fa-solid fa-floppy-disk"></i> Save Changes</>}
                                    </button>
                                </form>

                                <div className="settings-divider"></div>

                                <div className="settings-form">
                                    <div className="settings-field">
                                        <label className="settings-field__label">Avatar</label>
                                        <span className="settings-field__hint">Update your profile picture</span>
                                    </div>
                                    <button
                                        className="settings-btn settings-btn--secondary"
                                        type="button"
                                        onClick={() => navigate('/EditProfile')}
                                    >
                                        <i className="fa-solid fa-image"></i> Edit Avatar
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeSection === 'security' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Security</h3>
                                    <p>Protect your account and manage your active sessions</p>
                                </div>

                                <div className="settings-data-card settings-data-card--clickable" onClick={() => navigate('/MFA')}>
                                    <div className="settings-data-card__info">
                                        <span className="settings-data-card__label">Two-Factor Authentication</span>
                                        <span className="settings-data-card__value">Add an extra layer of security with TOTP codes from an authenticator app</span>
                                    </div>
                                </div>
                                <button className="settings-btn settings-btn--secondary" type="button" onClick={() => navigate('/MFA')}>
                                    <i className="fa-solid fa-shield-halved"></i> Manage Two-Factor Authentication
                                </button>

                                <div className="settings-divider"></div>

                                <div className="settings-data-card settings-data-card--clickable" onClick={() => navigate('/Sessions')}>
                                    <div className="settings-data-card__info">
                                        <span className="settings-data-card__label">Active Sessions</span>
                                        <span className="settings-data-card__value">Review which devices are signed in and revoke any you don't recognize</span>
                                    </div>
                                </div>
                                <button className="settings-btn settings-btn--secondary" type="button" onClick={() => navigate('/Sessions')}>
                                    <i className="fa-solid fa-computer"></i> Manage Sessions
                                </button>
                            </div>
                        )}

                        {activeSection === 'notifications' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Notifications</h3>
                                    <p>Get notified when new episodes, seasons, and releases are out</p>
                                </div>

                                <div className="settings-data-card">
                                    <div className="settings-data-card__info">
                                        <span className="settings-data-card__label">This Device</span>
                                        {push.subscribed ? (
                                            <span className="settings-data-card__value">Push notifications are enabled</span>
                                        ) : push.permission === 'denied' ? (
                                            <span className="settings-data-card__value">Notifications are blocked in browser settings</span>
                                        ) : (
                                            <span className="settings-data-card__value">Push notifications are off for this device</span>
                                        )}
                                        <span className="settings-data-card__sub">
                                            {!push.supported
                                                ? 'This browser does not support push notifications'
                                                : !push.inPwaContext
                                                    ? 'Install Trackist and open it from your home screen to receive notifications'
                                                    : 'You can still receive alerts from the Upcoming pages without enabling this'}
                                        </span>
                                    </div>
                                    {push.supported && push.inPwaContext && !push.subscribed && push.permission !== 'denied' && (
                                        <button
                                            className="settings-btn settings-btn--primary"
                                            type="button"
                                            onClick={handleEnablePush}
                                            disabled={push.loading}
                                        >
                                            {push.loading ? <><i className="fa-solid fa-spinner fa-spin"></i> Enabling...</> : <><i className="fa-solid fa-bell"></i> Enable Notifications</>}
                                        </button>
                                    )}
                                    {push.supported && push.inPwaContext && (push.subscribed || push.permission === 'denied') && (
                                        <button
                                            className="settings-btn settings-btn--secondary"
                                            type="button"
                                            onClick={handleDisablePush}
                                            disabled={push.loading}
                                        >
                                            {push.loading ? <><i className="fa-solid fa-spinner fa-spin"></i> Disabling...</> : <><i className="fa-solid fa-bell-slash"></i> Disable</>}
                                        </button>
                                    )}
                                    {!push.supported && canInstall && (
                                        <button
                                            className="settings-btn settings-btn--secondary"
                                            type="button"
                                            onClick={install}
                                        >
                                            <i className="fa-solid fa-download"></i> Install App
                                        </button>
                                    )}
                                    {push.supported && !push.inPwaContext && canInstall && (
                                        <button
                                            className="settings-btn settings-btn--secondary"
                                            type="button"
                                            onClick={install}
                                        >
                                            <i className="fa-solid fa-download"></i> Install App
                                        </button>
                                    )}
                                    {!push.supported && !canInstall && (
                                        <span className="settings-data-card__sub">Available on the installed app</span>
                                    )}
                                    {push.supported && !push.inPwaContext && !canInstall && (
                                        <span className="settings-data-card__sub">Available on the installed app</span>
                                    )}
                                </div>

                                {pushMessage && (
                                    <div className="settings-alert settings-alert--success">{pushMessage}</div>
                                )}

                                <div className="settings-divider"></div>

                                {notificationPrefs.map(pref => {
                                    const message = notifMessage[pref.id]
                                    return (
                                    <div key={pref.id}>
                                        <div className="settings-toggle-row">
                                            <div className="settings-toggle-row__info">
                                                <span className="settings-toggle-row__label">{pref.label}</span>
                                                <span className="settings-toggle-row__desc">{pref.desc}</span>
                                            </div>
                                            <label className="settings-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={notifPrefs[pref.id]}
                                                    onChange={() => handleNotificationPrefUpdate(pref.id)}
                                                    disabled={notifLoading[pref.id]}
                                                />
                                                <span className="settings-switch__slider"></span>
                                            </label>
                                        </div>
                                        {message && (
                                            <div className={`settings-alert ${message.isError ? 'settings-alert--error' : 'settings-alert--success'}`}>{message.text}</div>
                                        )}
                                    </div>
                                    )
                                })}

                                <div className="settings-divider"></div>

                                <div className="settings-info-box">
                                    <i className="fa-solid fa-circle-info"></i>
                                    <div>
                                        <h4>About Notifications</h4>
                                        <p>What's new is checked automatically each day, so you'll be alerted when something on your watchlist airs or releases today. Alerts are delivered straight to this device by your browser — nothing is stored on our servers beyond your saved preferences and device subscription.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'data' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Data & Cache</h3>
                                    <p>Manage your data and cache settings</p>
                                </div>

                                <div className="settings-data-card">
                                    <div className="settings-data-card__info">
                                        <span className="settings-data-card__label">Cache Status</span>
                                        <span className="settings-data-card__value">
                                            {cacheStats.memoryEntries + cacheStats.dbEntries} entries cached
                                        </span>
                                        <span className="settings-data-card__sub">
                                            {cacheStats.memoryEntries} in memory · {cacheStats.dbEntries} in database
                                        </span>
                                    </div>
                                 <button
                                     className="settings-btn settings-btn--secondary"
                                     onClick={clearCache}
                                     disabled={isClearing || (cacheStats.memoryEntries === 0 && cacheStats.dbEntries === 0)}
                                 >
                                     {isClearing ? <><i className="fa-solid fa-spinner fa-spin"></i> Clearing...</> : <><i className="fa-solid fa-trash"></i> Clear Cache</>}
                                 </button>
                                 </div>

                                 <div className="settings-divider"></div>

                                 {!isPWA && canInstall && (
                                 <div className="settings-data-card">
                                     <div className="settings-data-card__info">
                                         <span className="settings-data-card__label">Install App</span>
                                         <span className="settings-data-card__value">Install Trackist on your device</span>
                                         <span className="settings-data-card__sub">Add to your home screen for a native app experience</span>
                                     </div>
                                     <button
                                         className="settings-btn settings-btn--secondary"
                                         onClick={install}
                                     >
                                         <i className="fa-solid fa-download"></i> Install App
                                     </button>
                                 </div>
                                 )}

                                <div className="settings-divider"></div>

                                <div className="settings-data-card">
                                    <div className="settings-data-card__info">
                                        <span className="settings-data-card__label">Export Your Data</span>
                                        <span className="settings-data-card__value">Download all your Trackist data</span>
                                        <span className="settings-data-card__sub">JSON includes your watchlist, lists, and follows</span>
                                    </div>
                                    <div className="settings-data-card__actions">
                                        <button
                                            className="settings-btn settings-btn--secondary"
                                            onClick={handleExportData}
                                            disabled={exportLoading}
                                        >
                                            {exportLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Exporting...</> : <><i className="fa-solid fa-file-code"></i> Export JSON</>}
                                        </button>
                                        <button
                                            className="settings-btn settings-btn--secondary"
                                            onClick={handleExportCSV}
                                            disabled={exportCsvLoading}
                                        >
                                            {exportCsvLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Exporting...</> : <><i className="fa-solid fa-file-csv"></i> Export CSV</>}
                                        </button>
                                    </div>
                                </div>

                                {dataMessage && <div className="settings-alert settings-alert--success">{dataMessage}</div>}
                            </div>
                        )}

                        {activeSection === 'additions' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Additions</h3>
                                    <p>Manage optional features and integrations</p>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">Stremio Button</span>
                                        <span className="settings-toggle-row__desc">Show an "Open in Stremio" button on movie and TV show detail pages</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input
                                            type="checkbox"
                                            checked={showStremioButton}
                                            onChange={handleAdditionsUpdate}
                                            disabled={additionsLoading}
                                        />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                {additionsMessage && <div className="settings-alert settings-alert--success">{additionsMessage}</div>}

                                <div className="settings-divider"></div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">Letterbox Button</span>
                                        <span className="settings-toggle-row__desc">Show a Letterbox icon on movie detail pages</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input
                                            type="checkbox"
                                            checked={showLetterboxButton}
                                            onChange={handleLetterboxUpdate}
                                            disabled={letterboxLoading}
                                        />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                {letterboxMessage && <div className="settings-alert settings-alert--success">{letterboxMessage}</div>}

                                <div className="settings-divider"></div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">Media Card Icons</span>
                                        <span className="settings-toggle-row__desc">Show action icons on media cards across the app</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input
                                            type="checkbox"
                                            checked={showMediaCardIcons}
                                            onChange={handleMediaCardIconsUpdate}
                                            disabled={iconsLoading}
                                        />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                {iconsMessage && <div className="settings-alert settings-alert--success">{iconsMessage}</div>}

                                <div className="settings-divider"></div>

                                <div className="settings-info-box">
                                    <i className="fa-solid fa-circle-info"></i>
                                    <div>
                                        <h4>About Integrations</h4>
                                        <p>When enabled, you'll see action buttons on movie and TV show pages that open the content directly in external apps using deep links. These features are off by default.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'danger' && (
                            <div className="settings-panel settings-panel--danger">
                                <div className="settings-panel__header">
                                    <h3>Danger Zone</h3>
                                    <p>Irreversible and destructive actions</p>
                                </div>

                                <div className="settings-danger-card">
                                    <div className="settings-danger-card__info">
                                        <span className="settings-danger-card__label">Delete Account</span>
                                        <span className="settings-danger-card__desc">
                                            Permanently delete your account and all associated data. This action cannot be undone.
                                        </span>
                                    </div>
                                </div>

                                <div className="settings-form">
                                    <div className="settings-field">
                                        <label className="settings-field__label">Type DELETE to confirm</label>
                                        <input
                                            className="settings-field__input settings-field__input--danger"
                                            type="text"
                                            value={deleteConfirm}
                                            onChange={(e) => setDeleteConfirm(e.target.value)}
                                            placeholder="DELETE"
                                        />
                                    </div>

                                    {deleteError && <div className="settings-alert settings-alert--error">{deleteError}</div>}

                                    <button
                                        className="settings-btn settings-btn--danger"
                                        onClick={handleDeleteAccount}
                                        disabled={deleteLoading || deleteConfirm !== 'DELETE'}
                                    >
                                        {deleteLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Deleting...</> : <><i className="fa-solid fa-trash-can"></i> Delete My Account</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Settings