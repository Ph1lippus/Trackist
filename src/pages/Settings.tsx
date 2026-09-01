import React, { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { requestPasswordReset, updateUserEmail, getProfile, updateProfile } from '../services/profileService'
import { useCache } from '../hooks/useCache'
import { getCachedOrFetch } from '../services/cacheService'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { usePageTitle } from '../hooks/usePageTitle'
import { useMediaCardIcons } from '../hooks/useMediaCardIcons'
import { useDetailSidebar } from '../hooks/useDetailSidebar'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useAuthRateLimit } from '../hooks/useAuthRateLimit'
import { validateDisplayName, validateEmail } from '../utils/validation'
import { getUTCTodayString } from '../utils/dateUtils'
import { useAuthStore } from '../stores/useAuthStore'
import { TimezonePicker } from '../components/settings/TimezonePicker'
import { CountryPicker } from '../components/settings/CountryPicker'
import { isNativePlatform } from '../services/nativePush'
import { getInstalledVersion, getLatestVersionManifest, isNewerVersion } from '../services/nativeUpdate'
import { useMobile } from '../contexts/useMobile'
import {
    UserRound,
    IdCard,
    ShieldCheck,
    Bell,
    Puzzle,
    Database,
    Smartphone,
    TriangleAlert,
    ChevronRight,
    Mail,
    KeyRound,
    Save,
    Image as ImageIcon,
    Fingerprint,
    Monitor,
    Bell as BellIcon,
    BellOff,
    Send,
    Download,
    RefreshCw,
    CheckCircle2,
    CircleAlert,
    Trash2,
    FileJson,
    FileSpreadsheet,
    Computer,
    Globe,
    Clock,
    Loader2,
    Info
} from 'lucide-react'

type SettingsSection = 'account' | 'profile' | 'security' | 'notifications' | 'app' | 'data' | 'additions' | 'danger'
type NotificationPrefField = 'notify_new_episode' | 'notify_new_season' | 'notify_release_date' | 'movie_notify_on_digital'

const ANDROID_APK_URL = 'https://track1st.vercel.app/track1st.apk'

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

const sectionIcon: Record<SettingsSection, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
    account: UserRound,
    profile: IdCard,
    security: ShieldCheck,
    notifications: Bell,
    app: Smartphone,
    data: Database,
    additions: Puzzle,
    danger: TriangleAlert
}

const sectionLabel: Record<SettingsSection, string> = {
    account: 'Account',
    profile: 'Profile',
    security: 'Security',
    notifications: 'Notifications',
    app: 'App',
    data: 'Data & Cache',
    additions: 'Additions',
    danger: 'Danger Zone'
}

const sectionDesc: Record<SettingsSection, string> = {
    account: 'Manage your email and password',
    profile: 'Update your display name and bio',
    security: 'Protect your account and manage your active sessions',
    notifications: 'Get notified when new episodes, seasons, and releases are out',
    app: 'Manage your Track1st app and updates',
    data: 'Manage your data and cache settings',
    additions: 'Manage optional features and integrations',
    danger: 'Irreversible and destructive actions'
}

// Grouping for the mobile Instagram-style menu list.
const sectionGroups: { title: string; sections: SettingsSection[] }[] = [
    { title: 'Account', sections: ['account', 'profile', 'security'] },
    { title: 'Preferences', sections: ['notifications', 'additions', 'data'] },
    { title: 'App', sections: ['app'] },
    { title: 'Danger Zone', sections: ['danger'] }
]

/* ===== Shared presentational pieces ===== */

interface InlineFeedbackProps {
    text: string
    isError?: boolean
}

// Small inline feedback shown directly under a control, with a subtle check icon.
const InlineFeedback: React.FC<InlineFeedbackProps> = ({ text, isError }) => (
    <span className={`settings-inline-feedback${isError ? ' settings-inline-feedback--error' : ''}`}>
        {isError ? <CircleAlert size={13} strokeWidth={2.2} /> : <CheckCircle2 size={13} strokeWidth={2.2} />}
        {text}
    </span>
)

interface SettingsPanelHeaderProps {
    section: SettingsSection
}

const SettingsPanelHeader: React.FC<SettingsPanelHeaderProps> = ({ section }) => {
    const Icon = sectionIcon[section]
    return (
        <div className="settings-panel__header">
            <div className="settings-panel__title-row">
                <span className="settings-panel__title-icon"><Icon size={18} strokeWidth={2.2} /></span>
                <h3>{sectionLabel[section]}</h3>
            </div>
            <p>{sectionDesc[section]}</p>
        </div>
    )
}

/* ===== Section components ===== */

interface SettingsProps {
    user: User | null
    email: string
    setEmail: (v: string) => void
    emailLoading: boolean
    resetLoading: boolean
    accountMessage: string
    accountError: string
    handleEmailUpdate: (e: React.FormEvent) => void
    handlePasswordReset: () => void
    profileProps: {
        displayName: string
        bio: string
        profileLoading: boolean
        profileMessage: string
        profileError: string
        handleProfileUpdate: (e: React.FormEvent) => void
    }
    securityProps: { navigate: (to: string) => void }
    notificationsProps: {
        push: ReturnType<typeof usePushNotifications>
        notifPrefs: Record<NotificationPrefField, boolean>
        notifLoading: Record<NotificationPrefField, boolean>
        notifMessage: Partial<Record<NotificationPrefField, { text: string; isError: boolean }>>
        timezone: string
        timezoneLoading: boolean
        countryCode: string
        countryLoading: boolean
        notifyHour: string
        hourLoading: boolean
        pushMessage: string
        handleNotificationPrefUpdate: (field: NotificationPrefField) => void
        handleTimezoneUpdate: (tz: string) => void
        handleCountryUpdate: (code: string) => void
        handleNotifyHourUpdate: (hour: string) => void
        handleMovieNotifyDigitalUpdate: () => void
        handleCheckNow: () => void
        handleSendTestPush: () => void
        handleEnablePush: () => void
        handleDisablePush: () => void
        canInstall: boolean
        install: () => void
    }
    appProps: {
        isNative: boolean
        installedAppVersion: string | null
        appVersionLoading: boolean
        appVersionMessage: string
        handleCheckAppUpdates: () => void
        navigate: (to: string) => void
    }
    dataProps: {
        cacheStats: { memoryEntries: number; dbEntries: number }
        clearCache: () => void
        isClearing: boolean
        isPWA: boolean
        canInstall: boolean
        install: () => void
        exportLoading: boolean
        exportCsvLoading: boolean
        dataMessage: string
        handleExportData: () => void
        handleExportCSV: () => void
    }
    additionsProps: {
        loadingStates: {
            stremio: boolean
            letterbox: boolean
            tmdb: boolean
            icons: boolean
            sidebar: boolean
        }
        messages: {
            stremio: string
            letterbox: string
            tmdb: string
            icons: string
            sidebar: string
        }
        showStremioButton: boolean
        showLetterboxButton: boolean
        showTmdbButton: boolean
        showMediaCardIcons: boolean
        alwaysOpenSidebar: boolean
        handleAdditionsUpdate: () => void
        handleLetterboxUpdate: () => void
        handleTmdbUpdate: () => void
        handleMediaCardIconsUpdate: () => void
        handleAlwaysOpenSidebarUpdate: () => void
    }
    dangerProps: {
        deleteConfirm: string
        setDeleteConfirm: (v: string) => void
        deleteLoading: boolean
        deleteError: string
        handleDeleteAccount: () => void
    }
}

const AccountSection: React.FC<Pick<SettingsProps, 'user' | 'email' | 'setEmail' | 'emailLoading' | 'resetLoading' | 'accountMessage' | 'accountError' | 'handleEmailUpdate' | 'handlePasswordReset'>> = ({
    email, setEmail, emailLoading, resetLoading, accountMessage, accountError, handleEmailUpdate, handlePasswordReset
}) => (
    <div className="settings-panel">
        <SettingsPanelHeader section="account" />

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
                {accountError && <InlineFeedback text={accountError} isError />}
                {accountMessage && <InlineFeedback text={accountMessage} />}
            </div>

            <button className="settings-btn settings-btn--primary" type="submit" disabled={emailLoading}>
                {emailLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Sending...</> : <><Mail size={16} strokeWidth={2.2} /> Change Email</>}
            </button>
        </form>

        <div className="settings-divider"></div>

        <div className="settings-form">
            <div className="settings-field">
                <label className="settings-field__label">Password</label>
                <span className="settings-field__hint">Need to change your password? We'll send a reset link to your email.</span>
            </div>

            <button className="settings-btn settings-btn--secondary" type="button" onClick={handlePasswordReset} disabled={resetLoading}>
                {resetLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Sending...</> : <><KeyRound size={16} strokeWidth={2.2} /> Send Password Reset Link</>}
            </button>
        </div>
    </div>
)

const ProfileSection: React.FC<{ profileProps: SettingsProps['profileProps']; navigate: (to: string) => void }> = ({ profileProps, navigate }) => {
    const { displayName, bio, profileLoading, profileMessage, profileError, handleProfileUpdate } = profileProps
    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="profile" />

            <form className="settings-form" onSubmit={handleProfileUpdate}>
                <div className="settings-field">
                    <label className="settings-field__label">Display Name</label>
                    <input
                        className="settings-field__input"
                        type="text"
                        value={displayName}
                        onChange={(e) => profilePropsOnNameChange(e, profileProps)}
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
                        onChange={(e) => profilePropsOnBioChange(e, profileProps)}
                        placeholder="Tell us about yourself..."
                        maxLength={200}
                        rows={4}
                    />
                    <span className="settings-field__hint">{bio.length}/200 characters</span>
                </div>

                {profileError && <InlineFeedback text={profileError} isError />}
                {profileMessage && <InlineFeedback text={profileMessage} />}

                <button className="settings-btn settings-btn--primary" type="submit" disabled={profileLoading}>
                    {profileLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Saving...</> : <><Save size={16} strokeWidth={2.2} /> Save Changes</>}
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
                    <ImageIcon size={16} strokeWidth={2.2} /> Edit Avatar
                </button>
            </div>
        </div>
    )
}

// Helpers so ProfileSection doesn't reference the raw state setters directly
interface ProfileStateProps {
    displayName: string
    bio: string
    profileLoading: boolean
    profileMessage: string
    profileError: string
    setDisplayName?: Dispatch<SetStateAction<string>>
    setBio?: Dispatch<SetStateAction<string>>
    handleProfileUpdate: (e: React.FormEvent) => void
}

const profilePropsOnNameChange = (e: React.ChangeEvent<HTMLInputElement>, p: ProfileStateProps) => {
    p.setDisplayName?.(e.target.value)
}
const profilePropsOnBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>, p: ProfileStateProps) => {
    p.setBio?.(e.target.value)
}

const SecuritySection: React.FC<Pick<SettingsProps, 'securityProps'>> = ({ securityProps }) => {
    const { navigate } = securityProps
    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="security" />

            <div className="settings-link-card settings-link-card--clickable" onClick={() => navigate('/MFA')}>
                <div className="settings-link-card__icon"><Fingerprint size={20} strokeWidth={2} /></div>
                <div className="settings-link-card__info">
                    <span className="settings-link-card__label">Two-Factor Authentication</span>
                    <span className="settings-link-card__value">Add an extra layer of security with TOTP codes from an authenticator app</span>
                </div>
                <ChevronRight size={18} strokeWidth={2} className="settings-link-card__chevron" />
            </div>

            <div className="settings-link-card settings-link-card--clickable" onClick={() => navigate('/Sessions')}>
                <div className="settings-link-card__icon"><Monitor size={20} strokeWidth={2} /></div>
                <div className="settings-link-card__info">
                    <span className="settings-link-card__label">Active Sessions</span>
                    <span className="settings-link-card__value">Review which devices are signed in and revoke any you don't recognize</span>
                </div>
                <ChevronRight size={18} strokeWidth={2} className="settings-link-card__chevron" />
            </div>
        </div>
    )
}

const NotificationsSection: React.FC<Pick<SettingsProps, 'notificationsProps'>> = ({ notificationsProps }) => {
    const {
        push, notifPrefs, notifLoading, notifMessage, timezone, timezoneLoading, countryCode, countryLoading,
        notifyHour, hourLoading, pushMessage, handleNotificationPrefUpdate, handleTimezoneUpdate, handleCountryUpdate,
        handleNotifyHourUpdate, handleMovieNotifyDigitalUpdate, handleCheckNow, handleSendTestPush,
        handleEnablePush, handleDisablePush, canInstall, install
    } = notificationsProps

    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="notifications" />

            <div className="settings-data-card">
                <div className="settings-data-card__icon"><Bell size={20} strokeWidth={2} /></div>
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
                                ? 'Install Track1st and open it from your home screen to receive notifications'
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
                        {push.loading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Enabling...</> : <><BellIcon size={16} strokeWidth={2.2} /> Enable Notifications</>}
                    </button>
                )}
                {push.supported && push.inPwaContext && (push.subscribed || push.permission === 'denied') && (
                    <button
                        className="settings-btn settings-btn--secondary"
                        type="button"
                        onClick={handleDisablePush}
                        disabled={push.loading}
                    >
                        {push.loading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Disabling...</> : <><BellOff size={16} strokeWidth={2.2} /> Disable</>}
                    </button>
                )}
                {push.subscribed && (
                    <button
                        className="settings-btn settings-btn--secondary"
                        type="button"
                        onClick={handleSendTestPush}
                        disabled={push.loading}
                    >
                        {push.loading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Sending...</> : <><Send size={16} strokeWidth={2.2} /> Send Test Notification</>}
                    </button>
                )}
                {!push.supported && canInstall && (
                    <button className="settings-btn settings-btn--secondary" type="button" onClick={install}>
                        <Download size={16} strokeWidth={2.2} /> Install App
                    </button>
                )}
                {push.supported && !push.inPwaContext && canInstall && (
                    <button className="settings-btn settings-btn--secondary" type="button" onClick={install}>
                        <Download size={16} strokeWidth={2.2} /> Install App
                    </button>
                )}
                {!push.supported && !canInstall && (
                    <span className="settings-data-card__sub">Available on the installed app</span>
                )}
                {push.supported && !push.inPwaContext && !canInstall && (
                    <span className="settings-data-card__sub">Available on the installed app</span>
                )}
            </div>

            {pushMessage && <InlineFeedback text={pushMessage} />}

            <div className="settings-divider"></div>

            <div className="settings-data-card">
                <div className="settings-data-card__icon"><Globe size={20} strokeWidth={2} /></div>
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Timezone</span>
                    <span className="settings-data-card__sub">Used to determine which episodes air today for you</span>
                </div>
                <TimezonePicker
                    value={timezone}
                    onChange={handleTimezoneUpdate}
                    autoDetectLabel={`Auto-detected: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
                    disabled={timezoneLoading}
                />
            </div>

            <div className="settings-divider"></div>

            <div className="settings-data-card">
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Streaming Country</span>
                    <span className="settings-data-card__sub">Used to find available streaming providers and digital release dates</span>
                </div>
                <CountryPicker
                    value={countryCode}
                    onChange={handleCountryUpdate}
                    disabled={countryLoading}
                />
            </div>

            <div className="settings-divider"></div>

            <div className="settings-data-card">
                <div className="settings-data-card__icon"><Clock size={20} strokeWidth={2} /></div>
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Preferred Notification Hour</span>
                    <span className="settings-data-card__sub">Hour of day (your local time) when daily checks run</span>
                </div>
                <input
                    type="time"
                    className="settings-field__input settings-field__input--inline"
                    value={notifyHour}
                    onChange={(e) => handleNotifyHourUpdate(e.target.value)}
                    disabled={hourLoading}
                />
            </div>

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
                        {message && <InlineFeedback text={message.text} isError={message.isError} />}
                    </div>
                )
            })}

            <div className="settings-divider"></div>

            <div className="settings-data-card">
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Digital-Only Movie Alerts</span>
                    <span className="settings-data-card__desc">Only notify when movies are available to stream/rent (not theatrical releases)</span>
                </div>
                <label className="settings-switch">
                    <input
                        type="checkbox"
                        checked={notifPrefs.movie_notify_on_digital}
                        onChange={handleMovieNotifyDigitalUpdate}
                        disabled={notifLoading.movie_notify_on_digital}
                    />
                    <span className="settings-switch__slider"></span>
                </label>
                {notifMessage.movie_notify_on_digital && (
                    <InlineFeedback text={notifMessage.movie_notify_on_digital!.text} isError={notifMessage.movie_notify_on_digital!.isError} />
                )}
            </div>

            <div className="settings-divider"></div>

            <button className="settings-btn settings-btn--secondary" type="button" onClick={handleCheckNow}>
                <RefreshCw size={16} strokeWidth={2.2} /> Check Now
            </button>

            <div className="settings-divider"></div>

            <div className="settings-info-box">
                <Info size={20} strokeWidth={2} />
                <div>
                    <h4>About Notifications</h4>
                    <p>What's new is checked automatically every hour, so you'll be alerted shortly after episodes air or movies hit streaming services. Alerts are delivered straight to this device by your browser â€” nothing is stored on our servers beyond your saved preferences and device subscription.</p>
                </div>
            </div>
        </div>
    )
}

const AppSection: React.FC<Pick<SettingsProps, 'appProps'>> = ({ appProps }) => {
    const { isNative, installedAppVersion, appVersionLoading, appVersionMessage, handleCheckAppUpdates, navigate } = appProps
    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="app" />

            {isNative && (
                <>
                    <div className="settings-data-card">
                        <div className="settings-data-card__icon"><Smartphone size={20} strokeWidth={2} /></div>
                        <div className="settings-data-card__info">
                            <span className="settings-data-card__label">Installed Version</span>
                            <span className="settings-data-card__value">
                                {installedAppVersion ? `v${installedAppVersion}` : 'Loading version...'}
                            </span>
                            <span className="settings-data-card__sub">
                                Updates are checked automatically when you open the app.
                            </span>
                        </div>
                        <button
                            className="settings-btn settings-btn--secondary"
                            onClick={handleCheckAppUpdates}
                            disabled={appVersionLoading}
                        >
                            {appVersionLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Checking...</> : <><RefreshCw size={16} strokeWidth={2.2} /> Check for Updates</>}
                        </button>
                    </div>
                    {appVersionMessage && <InlineFeedback text={appVersionMessage} />}
                    <div className="settings-divider"></div>
                </>
            )}

            <div className="settings-data-card">
                <div className="settings-data-card__icon"><Computer size={20} strokeWidth={2} /></div>
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Android App</span>
                    <span className="settings-data-card__value">Receive alerts the moment they air</span>
                    <span className="settings-data-card__sub">
                        The native app is built automatically from the latest code and delivers push
                        notifications reliably even when your browser is closed. Download the APK to you
                        phone, open it, and allow installation from unknown sources when prompted.
                    </span>
                </div>
                <a
                    className="settings-btn settings-btn--primary"
                    href={ANDROID_APK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="track1st.apk"
                >
                    <Download size={16} strokeWidth={2.2} /> Download Android App
                </a>
            </div>

            <div className="settings-divider"></div>

            <div className="settings-info-box">
                <Info size={20} strokeWidth={2} />
                <div>
                    <h4>About the App</h4>
                    <p>Rebuilds happen automatically on every update, so the download link always points
                        to the latest version. You can also add Track1st to your home screen from your
                        browser for a similar experience without an install.</p>
                </div>
            </div>

            <div className="settings-divider"></div>

            <div className="settings-link-card settings-link-card--clickable" onClick={() => navigate('/Credits')}>
                <div className="settings-link-card__icon"><Info size={20} strokeWidth={2} /></div>
                <div className="settings-link-card__info">
                    <span className="settings-link-card__label">Credits</span>
                    <span className="settings-link-card__value">See the libraries and services that power Track1st</span>
                </div>
                <ChevronRight size={18} strokeWidth={2} className="settings-link-card__chevron" />
            </div>
        </div>
    )
}

const DataSection: React.FC<Pick<SettingsProps, 'dataProps'>> = ({ dataProps }) => {
    const { cacheStats, clearCache, isClearing, isPWA, canInstall, install, exportLoading, exportCsvLoading, dataMessage, handleExportData, handleExportCSV } = dataProps
    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="data" />

            <div className="settings-data-card">
                <div className="settings-data-card__icon"><Database size={20} strokeWidth={2} /></div>
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Cache Status</span>
                    <span className="settings-data-card__value">
                        {cacheStats.memoryEntries + cacheStats.dbEntries} entries cached
                    </span>
                    <span className="settings-data-card__sub">
                        {cacheStats.memoryEntries} in memory Â· {cacheStats.dbEntries} in database
                    </span>
                </div>
                <button
                    className="settings-btn settings-btn--secondary"
                    onClick={clearCache}
                    disabled={isClearing || (cacheStats.memoryEntries === 0 && cacheStats.dbEntries === 0)}
                >
                    {isClearing ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Clearing...</> : <><Trash2 size={16} strokeWidth={2.2} /> Clear Cache</>}
                </button>
            </div>

            <div className="settings-divider"></div>

            {!isPWA && canInstall && (
                <>
                    <div className="settings-data-card">
                        <div className="settings-data-card__info">
                            <span className="settings-data-card__label">Install App</span>
                            <span className="settings-data-card__value">Install Track1st on your device</span>
                            <span className="settings-data-card__sub">Add to your home screen for a native app experience</span>
                        </div>
                        <button className="settings-btn settings-btn--secondary" onClick={install}>
                            <Download size={16} strokeWidth={2.2} /> Install App
                        </button>
                    </div>
                    <div className="settings-divider"></div>
                </>
            )}

            <div className="settings-data-card">
                <div className="settings-data-card__info">
                    <span className="settings-data-card__label">Export Your Data</span>
                    <span className="settings-data-card__value">Download all your Track1st data</span>
                    <span className="settings-data-card__sub">JSON includes your watchlist, lists, and follows</span>
                </div>
                <div className="settings-data-card__actions">
                    <button
                        className="settings-btn settings-btn--secondary"
                        onClick={handleExportData}
                        disabled={exportLoading}
                    >
                        {exportLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Exporting...</> : <><FileJson size={16} strokeWidth={2.2} /> Export JSON</>}
                    </button>
                    <button
                        className="settings-btn settings-btn--secondary"
                        onClick={handleExportCSV}
                        disabled={exportCsvLoading}
                    >
                        {exportCsvLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Exporting...</> : <><FileSpreadsheet size={16} strokeWidth={2.2} /> Export CSV</>}
                    </button>
                </div>
            </div>

            {dataMessage && <InlineFeedback text={dataMessage} />}
        </div>
    )
}

interface AdditionsToggleRowProps {
    label: string
    desc: string
    checked: boolean
    disabled?: boolean
    onChange: () => void
    message?: string
}

const AdditionsToggleRow: React.FC<AdditionsToggleRowProps> = ({ label, desc, checked, disabled, onChange, message }) => (
    <div>
        <div className="settings-toggle-row">
            <div className="settings-toggle-row__info">
                <span className="settings-toggle-row__label">{label}</span>
                <span className="settings-toggle-row__desc">{desc}</span>
            </div>
            <label className="settings-switch">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                />
                <span className="settings-switch__slider"></span>
            </label>
        </div>
        {message && <InlineFeedback text={message} />}
    </div>
)

const AdditionsSection: React.FC<Pick<SettingsProps, 'additionsProps'>> = ({ additionsProps }) => {
    const { loadingStates, messages, showStremioButton, showLetterboxButton, showTmdbButton, showMediaCardIcons, alwaysOpenSidebar, handleAdditionsUpdate, handleLetterboxUpdate, handleTmdbUpdate, handleMediaCardIconsUpdate, handleAlwaysOpenSidebarUpdate } = additionsProps

    return (
        <div className="settings-panel">
            <SettingsPanelHeader section="additions" />

            <AdditionsToggleRow
                label="Stremio Button"
                desc={'Show an "Open in Stremio" button on movie and TV show detail pages'}
                checked={showStremioButton}
                onChange={handleAdditionsUpdate}
                disabled={loadingStates.stremio}
                message={messages.stremio}
            />

            <div className="settings-divider"></div>

            <AdditionsToggleRow
                label="Letterbox Button"
                desc="Show a Letterbox icon on movie detail pages"
                checked={showLetterboxButton}
                onChange={handleLetterboxUpdate}
                disabled={loadingStates.letterbox}
                message={messages.letterbox}
            />

            <div className="settings-divider"></div>

            <AdditionsToggleRow
                label="TMDB Button"
                desc="Show a TMDB icon on movie and TV show detail pages"
                checked={showTmdbButton}
                onChange={handleTmdbUpdate}
                disabled={loadingStates.tmdb}
                message={messages.tmdb}
            />

            <div className="settings-divider"></div>

            <AdditionsToggleRow
                label="Media Card Icons"
                desc="Show action icons on media cards across the app"
                checked={showMediaCardIcons}
                onChange={handleMediaCardIconsUpdate}
                disabled={loadingStates.icons}
                message={messages.icons}
            />

            <div className="settings-divider"></div>

            <AdditionsToggleRow
                label="Detail Sidebar"
                desc="Keep the action-button sidebar open on mobile movie, TV show and episode detail pages"
                checked={alwaysOpenSidebar}
                onChange={handleAlwaysOpenSidebarUpdate}
                disabled={loadingStates.sidebar}
                message={messages.sidebar}
            />

            <div className="settings-divider"></div>

            <div className="settings-info-box">
                <Info size={20} strokeWidth={2} />
                <div>
                    <h4>About Integrations</h4>
                    <p>When enabled, you'll see action buttons on movie and TV show pages that open the content directly in external apps using deep links. These features are off by default.</p>
                </div>
            </div>
        </div>
    )
}

const DangerSection: React.FC<Pick<SettingsProps, 'dangerProps'>> = ({ dangerProps }) => {
    const { deleteConfirm, setDeleteConfirm, deleteLoading, deleteError, handleDeleteAccount } = dangerProps
    return (
        <div className="settings-panel settings-panel--danger">
            <SettingsPanelHeader section="danger" />

            <div className="settings-danger-card">
                <div className="settings-danger-card__info">
                    <span className="settings-danger-card__label"><TriangleAlert size={18} strokeWidth={2.2} /> Delete Account</span>
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

                {deleteError && <InlineFeedback text={deleteError} isError />}

                <button
                    className="settings-btn settings-btn--danger"
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading || deleteConfirm !== 'DELETE'}
                >
                    {deleteLoading ? <><Loader2 className="lucide-spin" size={16} strokeWidth={2.2} /> Deleting...</> : <><Trash2 size={16} strokeWidth={2.2} /> Delete My Account</>}
                </button>
            </div>
        </div>
    )
}

/* ===== Page components ===== */

const renderSection = (section: SettingsSection | undefined, p: SettingsProps, navigate: (to: string) => void): React.ReactNode => {
    switch (section) {
        case 'account':
            return <AccountSection {...p} />
        case 'profile':
            return <ProfileSection profileProps={p.profileProps} navigate={navigate} />
        case 'security':
            return <SecuritySection securityProps={{ navigate }} />
        case 'notifications':
            return <NotificationsSection notificationsProps={p.notificationsProps} />
        case 'app':
            return <AppSection appProps={p.appProps} />
        case 'data':
            return <DataSection dataProps={p.dataProps} />
        case 'additions':
            return <AdditionsSection additionsProps={p.additionsProps} />
        case 'danger':
            return <DangerSection dangerProps={p.dangerProps} />
        default:
            return null
    }
}

const SettingsMenuRows: React.FC<{ active: SettingsSection | null; onSelect: (s: SettingsSection) => void }> = ({ active, onSelect }) => (
    <div className="settings-menu-list">
        {sectionGroups.map(group => (
            <div key={group.title} className="settings-menu-group">
                <span className="settings-menu-group__title">{group.title}</span>
                {group.sections.map(section => {
                    const Icon = sectionIcon[section]
                    return (
                        <button
                            key={section}
                            type="button"
                            className={`settings-menu-row${active === section ? ' active' : ''}${section === 'danger' ? ' settings-menu-row--danger' : ''}`}
                            onClick={() => onSelect(section)}
                        >
                            <span className="settings-menu-row__icon"><Icon size={20} strokeWidth={2} /></span>
                            <span className="settings-menu-row__label">{sectionLabel[section]}</span>
                            <ChevronRight size={18} strokeWidth={2} className="settings-menu-row__chevron" />
                        </button>
                    )
                })}
            </div>
        ))}
    </div>
)

const Settings: React.FC = () => {
    usePageTitle('Track1st - Settings')
    const navigate = useNavigate()
    const { section } = useParams<{ section?: string }>()
    const { isMobile } = useMobile()
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const { allowed: resetAllowed, recordAttempt: recordResetAttempt, retryAfterFormatted: resetRetryAfter } = useAuthRateLimit('passwordReset')
    const resetRateLimited = !resetAllowed

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
        notify_release_date: true,
        movie_notify_on_digital: true
    })
    const [timezone, setTimezone] = useState<string>('UTC')
    const [countryCode, setCountryCode] = useState<string>('PT')
    const [notifyHour, setNotifyHour] = useState<string>('08:00')
    const [notifLoading, setNotifLoading] = useState<Record<NotificationPrefField, boolean>>({
        notify_new_episode: false,
        notify_new_season: false,
        notify_release_date: false,
        movie_notify_on_digital: false
    })
    const [timezoneLoading, setTimezoneLoading] = useState(false)
    const [countryLoading, setCountryLoading] = useState(false)
    const [hourLoading, setHourLoading] = useState(false)
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
    const [showTmdbButton, setShowTmdbButton] = useState(false)
    const { showIcons: showMediaCardIcons, setShowIcons: setShowMediaCardIcons } = useMediaCardIcons()
    const [additionsLoading, setAdditionsLoading] = useState(false)
    const [additionsMessage, setAdditionsMessage] = useState('')
    const [letterboxLoading, setLetterboxLoading] = useState(false)
    const [letterboxMessage, setLetterboxMessage] = useState('')
    const [tmdbLoading, setTmdbLoading] = useState(false)
    const [tmdbMessage, setTmdbMessage] = useState('')
    const [iconsLoading, setIconsLoading] = useState(false)
    const [iconsMessage, setIconsMessage] = useState('')
    const [alwaysOpenSidebar, setAlwaysOpenSidebar] = useState(false)
    const [sidebarLoading, setSidebarLoading] = useState(false)
    const [sidebarMessage, setSidebarMessage] = useState('')
    const { setAlwaysOpen: setAlwaysOpenSidebarStore } = useDetailSidebar()

    // App states
    const isNative = isNativePlatform()
    const [installedAppVersion, setInstalledAppVersion] = useState<string | null>(null)
    const [appVersionLoading, setAppVersionLoading] = useState(false)
    const [appVersionMessage, setAppVersionMessage] = useState('')

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
                    setShowTmdbButton(profileData.show_tmdb_button === true)
                    setShowMediaCardIcons(profileData.show_media_card_icons === true)
                    setAlwaysOpenSidebar(profileData.always_open_detail_sidebar === true)
                    setAlwaysOpenSidebarStore(profileData.always_open_detail_sidebar === true)
                    setNotifPrefs({
                        notify_new_episode: profileData.notify_new_episode !== false,
                        notify_new_season: profileData.notify_new_season !== false,
                        notify_release_date: profileData.notify_release_date !== false,
                        movie_notify_on_digital: profileData.movie_notify_on_digital !== false
                    })
                    setTimezone(profileData.timezone || 'UTC')
                    setCountryCode(profileData.country_code || 'PT')
                    setNotifyHour(profileData.notify_hour || '08:00')
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

        if (resetRateLimited) {
            setAccountError(`Too many reset attempts. Please try again in ${resetRetryAfter}.`)
            return
        }

        setAccountError('')
        setAccountMessage('')
        setResetLoading(true)

        // Record attempt BEFORE calling API to prevent hitting Supabase rate limits
        recordResetAttempt()

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

    const handleTimezoneUpdate = async (newTimezone: string) => {
        if (!currentUser) return
        setTimezoneLoading(true)
        const { error } = await updateProfile(currentUser.id, { timezone: newTimezone })
        setTimezoneLoading(false)
        if (error) {
            setNotifMessage(prev => ({ ...prev, notify_new_episode: { text: error.message, isError: true } }))
        } else {
            setTimezone(newTimezone)
        }
    }

    const handleCountryUpdate = async (newCountryCode: string) => {
        if (!currentUser) return
        setCountryLoading(true)
        const { error } = await updateProfile(currentUser.id, { country_code: newCountryCode })
        setCountryLoading(false)
        if (error) {
            setNotifMessage(prev => ({ ...prev, notify_new_episode: { text: error.message, isError: true } }))
        } else {
            setCountryCode(newCountryCode)
        }
    }

    const handleNotifyHourUpdate = async (newHour: string) => {
        if (!currentUser) return
        setHourLoading(true)
        const { error } = await updateProfile(currentUser.id, { notify_hour: newHour })
        setHourLoading(false)
        if (error) {
            setNotifMessage(prev => ({ ...prev, notify_new_episode: { text: error.message, isError: true } }))
        } else {
            setNotifyHour(newHour)
        }
    }

    const handleMovieNotifyDigitalUpdate = async () => {
        if (!currentUser) return
        setNotifLoading(prev => ({ ...prev, movie_notify_on_digital: true }))
        const { error } = await updateProfile(currentUser.id, { movie_notify_on_digital: !notifPrefs.movie_notify_on_digital })
        setNotifLoading(prev => ({ ...prev, movie_notify_on_digital: false }))
        if (error) {
            setNotifMessage(prev => ({ ...prev, movie_notify_on_digital: { text: error.message, isError: true } }))
            return
        }
        setNotifPrefs(prev => ({ ...prev, movie_notify_on_digital: !prev.movie_notify_on_digital }))
        setNotifMessage(prev => ({ ...prev, movie_notify_on_digital: { text: 'Preference updated successfully', isError: false } }))
    }

    const handleCheckNow = async () => {
        if (!currentUser) return
        setPushMessage('Checking for new episodes...')
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error('No session')

            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-new-content`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: currentUser.id })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Check failed')
            }

            const result = await res.json()
            setPushMessage(`Check complete: ${result.notifications_sent} notifications sent, ${result.items_scheduled} items scheduled`)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Check failed'
            setPushMessage(message)
        }
    }

    const handleSendTestPush = async () => {
        if (!currentUser) return
        setPushMessage('Sending test notification...')
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error('No session')

            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-new-content`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: currentUser.id, test: true })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Test push failed')
            }

            const result = await res.json()
            setPushMessage(`Test sent: ${result.test_notifications_sent} device(s) notified`)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Test push failed'
            setPushMessage(message)
        }
    }

    // Load the currently installed native app version (if running under Capacitor)
    useEffect(() => {
        if (!isNative) return
        void getInstalledVersion().then(setInstalledAppVersion)
    }, [isNative])

    const handleCheckAppUpdates = async () => {
        setAppVersionLoading(true)
        setAppVersionMessage('')
        try {
            const [installed, manifest] = await Promise.all([getInstalledVersion(), getLatestVersionManifest()])
            if (!manifest || !installed) {
                setAppVersionMessage('Could not reach the update server.')
            } else if (isNewerVersion(manifest.versionName, installed)) {
                window.dispatchEvent(new Event('track1st:check-update'))
                setAppVersionMessage(`An update to v${manifest.versionName} is available.`)
            } else {
                setAppVersionMessage('You are on the latest version.')
            }
        } finally {
            setAppVersionLoading(false)
        }
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

            downloadBlob(JSON.stringify(exportData, null, 2), `track1st-export-${getUTCTodayString()}.json`, 'application/json')

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

            downloadBlob(rowsToCSV(rows), `track1st-watchlist-${getUTCTodayString()}.csv`, 'text/csv;charset=utf-8')

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

    const handleTmdbUpdate = async () => {
        if (!currentUser) return
        setTmdbLoading(true)
        setTmdbMessage('')

        const { error } = await updateProfile(currentUser.id, {
            show_tmdb_button: !showTmdbButton
        })

        setTmdbLoading(false)

        if (error) {
            setTmdbMessage(error.message)
            return
        }

        setShowTmdbButton(prev => !prev)
        setTmdbMessage('Preference updated successfully')
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

    const handleAlwaysOpenSidebarUpdate = async () => {
        if (!currentUser) return
        setSidebarLoading(true)
        setSidebarMessage('')

        const newValue = !alwaysOpenSidebar
        setAlwaysOpenSidebar(newValue)

        const { error } = await updateProfile(currentUser.id, {
            always_open_detail_sidebar: newValue
        })

        setSidebarLoading(false)

        if (error) {
            setAlwaysOpenSidebar(!newValue)
            setSidebarMessage(error.message)
            return
        }

        setAlwaysOpenSidebarStore(newValue)
        setSidebarMessage('Preference updated successfully')
    }

    const handleEnablePush = async () => {
        const result = await push.enable()
        setPushMessage(result.ok ? 'Notifications enabled on this device' : (result.error || 'Failed to enable notifications'))
    }

    const handleDisablePush = async () => {
        const result = await push.disable()
        setPushMessage(result.ok ? 'Notifications disabled on this device' : (result.error || 'Failed to disable notifications'))
    }

    const sections: SettingsSection[] = ['account', 'profile', 'security', 'notifications', 'additions', 'data', 'app', 'danger']

    const activeSection = section && (sections as string[]).includes(section) ? (section as SettingsSection) : 'account'

    const profileProps = {
        displayName, bio, setDisplayName, setBio,
        profileLoading, profileMessage, profileError,
        handleProfileUpdate
    }

    const notificationsProps = {
        push, notifPrefs, notifLoading, notifMessage, timezone, timezoneLoading, countryCode, countryLoading,
        notifyHour, hourLoading, pushMessage, handleNotificationPrefUpdate, handleTimezoneUpdate, handleCountryUpdate,
        handleNotifyHourUpdate, handleMovieNotifyDigitalUpdate, handleCheckNow, handleSendTestPush,
        handleEnablePush, handleDisablePush, canInstall, install
    }

    const appProps = {
        isNative, installedAppVersion, appVersionLoading, appVersionMessage, handleCheckAppUpdates, navigate
    }

    const dataProps = {
        cacheStats, clearCache, isClearing, isPWA, canInstall, install, exportLoading, exportCsvLoading,
        dataMessage, handleExportData, handleExportCSV
    }

    const additionsProps = {
        loadingStates: { stremio: additionsLoading, letterbox: letterboxLoading, tmdb: tmdbLoading, icons: iconsLoading, sidebar: sidebarLoading },
        messages: { stremio: additionsMessage, letterbox: letterboxMessage, tmdb: tmdbMessage, icons: iconsMessage, sidebar: sidebarMessage },
        showStremioButton, showLetterboxButton, showTmdbButton, showMediaCardIcons, alwaysOpenSidebar,
        handleAdditionsUpdate, handleLetterboxUpdate, handleTmdbUpdate, handleMediaCardIconsUpdate, handleAlwaysOpenSidebarUpdate
    }

    const dangerProps = {
        deleteConfirm, setDeleteConfirm, deleteLoading, deleteError, handleDeleteAccount
    }

    const props: SettingsProps = {
        user: currentUser,
        email, setEmail,
        emailLoading, resetLoading, accountMessage, accountError,
        handleEmailUpdate, handlePasswordReset,
        securityProps: { navigate },
        profileProps,
        notificationsProps,
        appProps,
        dataProps,
        additionsProps,
        dangerProps
    }

    // For desktop we keep inline switching; represent as a local state.
    // (On mobile the active section is driven by the /Settings/:section route.)
    const [desktopSection, setDesktopSection] = useState<SettingsSection>('account')
    const shownSection = isMobile ? activeSection : desktopSection

    const selectSection = (s: SettingsSection) => {
        if (isMobile) {
            navigate(`/Settings/${s}`)
        } else {
            setDesktopSection(s)
        }
    }

    return (
        <section className="dashboard-page settings-page">
            <div className="dashboard-shell">
                {isMobile ? (
                    // Instagram-style mobile menu / sub-page
                    <div className="settings-mobile">
                        {section ? (
                            <div className="settings-mobile__page">
                                {renderSection(activeSection, props, navigate)}
                            </div>
                        ) : (
                            <SettingsMenuRows active={null} onSelect={selectSection} />
                        )}
                    </div>
                ) : (
                    <div className="settings-layout">
                        <aside className="settings-sidebar">
                            {sectionGroups.map(group => (
                                <div key={group.title} className="settings-nav-group">
                                    <span className="settings-nav-group__title">{group.title}</span>
                                    {group.sections.map(sectionId => {
                                        const Icon = sectionIcon[sectionId]
                                        return (
                                            <button
                                                key={sectionId}
                                                className={`settings-nav-item ${shownSection === sectionId ? 'active' : ''} ${sectionId === 'danger' ? 'settings-nav-item--danger' : ''}`}
                                                onClick={() => setDesktopSection(sectionId)}
                                            >
                                                <i className="settings-nav-item__icon-wrap"><Icon size={18} strokeWidth={2} /></i>
                                                <span>{sectionLabel[sectionId]}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}
                        </aside>

                        <div className="settings-content">
                            {renderSection(shownSection, props, navigate)}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

export default Settings

