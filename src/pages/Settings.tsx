import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { requestPasswordReset, updateUserEmail, getProfile, updateProfile } from '../services/profileService'
import { useCache } from '../hooks/useCache'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { usePageTitle } from '../hooks/usePageTitle'
import { validateDisplayName, validateEmail } from '../utils/validation'
import { getUTCTodayString } from '../utils/dateUtils'
import { useAuthStore } from '../stores/useAuthStore'

type SettingsSection = 'account' | 'profile' | 'privacy' | 'notifications' | 'data' | 'danger' | 'additions'

const Settings: React.FC = () => {
    usePageTitle('Trackist - Settings')
    const navigate = useNavigate()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [activeSection, setActiveSection] = useState<SettingsSection>('account')
    const [loading, setLoading] = useState(true)

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

    // Privacy states
    const [isPrivate, setIsPrivate] = useState(false)
    const [privacyLoading, setPrivacyLoading] = useState(false)
    const [privacyMessage, setPrivacyMessage] = useState('')

    // Data states
    const { stats: cacheStats, clearCache, isClearing } = useCache()
    const { canInstall, isPWA, install } = usePWAInstall()
    const [exportLoading, setExportLoading] = useState(false)
    const [dataMessage, setDataMessage] = useState('')

    // Additions states
    const [showStremioButton, setShowStremioButton] = useState(false)
    const [showLetterboxButton, setShowLetterboxButton] = useState(false)
    const [showMediaCardIcons, setShowMediaCardIcons] = useState(false)
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

                const { data: profileData } = await getProfile(user.id)
                if (profileData) {
                    setDisplayName(profileData.display_name || '')
                    setBio(profileData.bio || '')
                    setShowStremioButton(profileData.show_stremio_button === true)
                    setShowLetterboxButton(profileData.show_letterbox_button === true)
                    setShowMediaCardIcons(profileData.show_media_card_icons === true)
                }
            }

            setLoading(false)
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

    const handlePrivacyUpdate = async () => {
        setPrivacyLoading(true)
        setPrivacyMessage('')

        const { error } = await supabase.auth.updateUser({
            data: { is_private: !isPrivate }
        })

        setPrivacyLoading(false)

        if (error) {
            setPrivacyMessage(error.message)
            return
        }

        setIsPrivate(!isPrivate)
        setPrivacyMessage(`Profile is now ${!isPrivate ? 'private' : 'public'}`)
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

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `trackist-export-${getUTCTodayString()}.json`
            a.click()
            URL.revokeObjectURL(url)

            setDataMessage('Data exported successfully')
        } catch {
            setDataMessage('Failed to export data')
        }

        setExportLoading(false)
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
        const { error } = await updateProfile(currentUser.id, {
            show_media_card_icons: newValue
        })

        setIconsLoading(false)

        if (error) {
            setIconsMessage(error.message)
            return
        }

        setShowMediaCardIcons(newValue)
        localStorage.setItem('trackist-show-media-card-icons', newValue ? '1' : '0')
        setIconsMessage('Preference updated successfully')
    }

    if (loading) {
        return (
            <section className="dashboard-page">
                <div className="dashboard-shell">
                    <div className="discover-loading">
                        <div className="discover-spinner"></div>
                        <p>Loading settings...</p>
                    </div>
                </div>
            </section>
        )
    }

    const sections: { id: SettingsSection; label: string; icon: string }[] = [
        { id: 'account', label: 'Account', icon: 'fa-user-shield' },
        { id: 'profile', label: 'Profile', icon: 'fa-id-card' },
        { id: 'privacy', label: 'Privacy', icon: 'fa-lock' },
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

                        {activeSection === 'privacy' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Privacy</h3>
                                    <p>Control who can see your profile and activity</p>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">Private Profile</span>
                                        <span className="settings-toggle-row__desc">When enabled, only your followers can see your watchlist and lists</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input
                                            type="checkbox"
                                            checked={isPrivate}
                                            onChange={handlePrivacyUpdate}
                                            disabled={privacyLoading}
                                        />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                {privacyMessage && <div className="settings-alert settings-alert--success">{privacyMessage}</div>}

                                <div className="settings-divider"></div>

                                <div className="settings-info-box">
                                    <i className="fa-solid fa-circle-info"></i>
                                    <div>
                                        <h4>Privacy Information</h4>
                                        <ul>
                                            <li>Your display name and bio are always visible</li>
                                            <li>Private profiles hide watchlist and lists from non-followers</li>
                                            <li>Statistics are always visible on your profile</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'notifications' && (
                            <div className="settings-panel">
                                <div className="settings-panel__header">
                                    <h3>Notifications</h3>
                                    <p>Manage how you receive updates</p>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">New Episode Alerts</span>
                                        <span className="settings-toggle-row__desc">Get notified when shows you're watching release new episodes</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">New Season Alerts</span>
                                        <span className="settings-toggle-row__desc">Get notified when shows you've caught up on get new seasons</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-row__info">
                                        <span className="settings-toggle-row__label">New Followers</span>
                                        <span className="settings-toggle-row__desc">Get notified when someone follows you</span>
                                    </div>
                                    <label className="settings-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="settings-switch__slider"></span>
                                    </label>
                                </div>

                                <div className="settings-divider"></div>

                                <div className="settings-info-box">
                                    <i className="fa-solid fa-circle-info"></i>
                                    <div>
                                        <h4>About Notifications</h4>
                                        <p>Notification preferences are saved to your account and apply across all your devices.</p>
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
                                        <span className="settings-data-card__sub">Includes watchlist, lists, and follows in JSON format</span>
                                    </div>
                                    <button
                                        className="settings-btn settings-btn--secondary"
                                        onClick={handleExportData}
                                        disabled={exportLoading}
                                    >
                                        {exportLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Exporting...</> : <><i className="fa-solid fa-download"></i> Export Data</>}
                                    </button>
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
