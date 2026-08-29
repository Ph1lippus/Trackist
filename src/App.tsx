import React, { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom'
import { updateLastActive } from './services/profileService'
import { initializeAuth, useAuthStore } from './stores/useAuthStore'
import { SearchProvider } from './contexts/SearchContext'
import { MobileProvider } from './contexts/MobileProvider'
import { useLibraryStore } from './stores/useLibraryStore'
import { registerSW } from 'virtual:pwa-register'
import { App as CapacitorApp } from '@capacitor/app'
import { initNativePush, isNativePlatform, requestNativePermission } from './services/nativePush'
import { usePushNotifications } from './hooks/usePushNotifications'
import ConfirmModal from './components/modals/ConfirmModal'
import {
    getInstalledVersion,
    getLatestVersion,
    isNewerVersion,
    openUpdateDownload,
    getUpdateDismissed,
    dismissUpdateVersion,
} from './services/nativeUpdate'
import { invalidateCalendarCache } from './services/calendarService'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import SecondaryNavbar from './components/layout/SecondaryNavbar'
import MobileBottomNavbar from './components/layout/MobileBottomNavbar'
import PWAUpdateModal from './components/modals/PWAUpdateModal'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Discover from './pages/Discover'
import Movies from './pages/Movies'
import TVShows from './pages/TVShows'
import Upcoming from './pages/Upcoming'
import UpcomingNew from './pages/UpcomingNew'
import Settings from './pages/Settings'
import Credits from './pages/Credits'
import ForgotPassword from './pages/ForgotPassword'
import Profile from './pages/Profile'
import Friends from './pages/Friends'
import Followers from './pages/Followers'
import Following from './pages/Following'
import Statistics from './pages/Statistics'
import EditProfile from './pages/EditProfile'
import Admin from './pages/Admin'
import MovieDetail from './pages/MovieDetail'
import TVShowDetail from './pages/TVShowDetail'
import PersonDetail from './pages/PersonDetail'
import EpisodeDetail from './pages/EpisodeDetail'
import Lists from './pages/Lists'
import ListsDetail from './pages/ListsDetail'
import ListsEditPage from './pages/ListsEditPage'
import ListsCreatePage from './pages/ListsCreatePage'
import Finished from './pages/Finished'
import MobileTVShows from './pages/MobileTVShows'
import MobileMovies from './pages/MobileMovies'
import DetailLayout from './components/layout/DetailLayout'
import MFA from './pages/MFA'
import Sessions from './pages/Sessions'
import AdminSecurity from './pages/AdminSecurity'
import { useSessionSecurity } from './hooks/useSessionSecurity'
import mfaService from './services/mfaService'
// Legacy redirect component for /Lists/:id -> /ListsDetail/:id
const LegacyListRedirect: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    return <Navigate to={`/ListsDetail/${id}`} replace />
}

const AppContent: React.FC = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const user = useAuthStore((state) => state.user)
    const loading = useAuthStore((state) => state.loading)
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const hasUpdatedLastActive = useRef(false)
    const [showUpdateModal, setShowUpdateModal] = useState(false)
    const [updateLoading, setUpdateLoading] = useState(false)
    const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null)
    const [nativeUpdateVersion, setNativeUpdateVersion] = useState<string | null>(null)
    const [showPushConfirm, setShowPushConfirm] = useState(false)
    const [pushConfirming, setPushConfirming] = useState(false)
    const [pushEnableError, setPushEnableError] = useState('')

    const push = usePushNotifications()

    // Determine if running as a PWA (standalone mode)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-expect-error - iOS Safari specific property
        (window.navigator.standalone === true) ||
        document.referrer.includes('android-app://')

    // Default route based on app context:
    // - PWA on mobile: open Mobile TV Shows by default
    // - PWA on desktop: open normal TV Shows page
    // - Website: open Discover page by default
    const isMobile = window.innerWidth < 768
    const defaultRoute = isPWA ? (isMobile ? '/MobileTVShows' : '/Tvshows') : '/Discover'

    const isDetailPage = location.pathname.match(/^\/(movie|tv|person)\/\d+$/) || location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/)

    useEffect(() => {
        void initializeAuth()
    }, [])

    useEffect(() => {
        if (isMobile && isPWA) {
            document.documentElement.classList.add('pwa-mobile')
        } else {
            document.documentElement.classList.remove('pwa-mobile')
        }
    }, [isMobile, isPWA])

    useEffect(() => {
        if (!loading && user && !hasUpdatedLastActive.current) {
            hasUpdatedLastActive.current = true
            void updateLastActive(user.id)
            // Initialize library store once at app startup
            void useLibraryStore.getState().fetchInitialLibrary(user.id)
            // Invalidate calendar cache on login to ensure fresh data
            void invalidateCalendarCache(user.id)
        }
    }, [loading, user])

    // Session security (auto-refresh, inactivity timeout, device tracking)
    useSessionSecurity()

    // Native (Capacitor) push: init listeners once and route notification taps
    useEffect(() => {
        if (!isNativePlatform()) return

        document.documentElement.classList.add('native-app')
        initNativePush()

        const onNavigate = (event: Event): void => {
            const url = (event as CustomEvent<{ url: string }>).detail?.url
            if (url) {
                navigate(url.startsWith('/') ? url : `/${url}`)
            }
        }
        window.addEventListener('track1st:navigate', onNavigate)
        return () => window.removeEventListener('track1st:navigate', onNavigate)
    }, [navigate])

    // Native (Capacitor) push: ask for the OS-level notification permission
    // right when the app opens. If the user grants it, an in-app confirm modal
    // asks them to actually turn on notifications before anything is saved to
    // the database (so a DB failure never silently swallows their choice).
    const hasRequestedNativePush = useRef(false)
    useEffect(() => {
        if (!isNativePlatform()) return
        if (hasRequestedNativePush.current) return
        if (!user) return
        if (push.loading) return
        if (push.subscribed) return
        if (push.permission !== 'prompt' && push.permission !== 'granted') return

        hasRequestedNativePush.current = true
        setPushEnableError('')
        void (async () => {
            let perm = push.permission
            if (perm === 'prompt') {
                perm = await requestNativePermission()
            }
            if (perm === 'granted') {
                setShowPushConfirm(true)
            }
        })()
    }, [user, push.loading, push.subscribed, push.permission])

    const handleConfirmPushEnable = async () => {
        setPushConfirming(true)
        setPushEnableError('')
        const result = await push.enable()
        if (result.ok) {
            setShowPushConfirm(false)
        } else {
            setPushEnableError(result.error ?? 'Failed to enable notifications')
        }
        setPushConfirming(false)
    }

    // Native (Capacitor) update check: compare installed version against the
    // latest android-latest release and surface the Update Available modal.
    // Runs on launch, on app resume and foreground, plus a periodic sweep, and
    // retries on transient failures (e.g. the release landed mid-check or the
    // network hiccuped) so an update is never silently missed.
    useEffect(() => {
        if (!isNativePlatform()) return

        let cancelled = false
        let retryTimer: number | undefined
        let resumeUnsubscribe: (() => void) | undefined

        // Returns true when the check concluded (update needed, current, or
        // dismissed); returns false when the lookup itself failed.
        const check = async (): Promise<boolean> => {
            if (cancelled) return true
            const [installed, latest] = await Promise.all([getInstalledVersion(), getLatestVersion()])
            if (cancelled) return true
            if (!latest || !installed) return false
            if (!isNewerVersion(latest, installed)) return true
            if (getUpdateDismissed(latest)) return true
            setNativeUpdateVersion(latest)
            setShowUpdateModal(true)
            return true
        }
        const runCheck = (): void => {
            void check().then((ok) => {
                if (!ok && !retryTimer && !cancelled) {
                    retryTimer = window.setTimeout(() => {
                        retryTimer = undefined
                        runCheck()
                    }, 60 * 1000)
                }
            })
        }
        const onCheckUpdate = (): void => {
            runCheck()
        }

        void CapacitorApp.addListener('resume', runCheck).then((handle) => {
            resumeUnsubscribe = () => void handle.remove()
        })
        const onVisibility = (): void => {
            if (document.visibilityState === 'visible') runCheck()
        }
        document.addEventListener('visibilitychange', onVisibility)

        runCheck()
        const intervalId = window.setInterval(runCheck, 5 * 60 * 1000)
        window.addEventListener('track1st:check-update', onCheckUpdate)

        return () => {
            cancelled = true
            if (retryTimer) window.clearTimeout(retryTimer)
            window.clearInterval(intervalId)
            window.removeEventListener('track1st:check-update', onCheckUpdate)
            document.removeEventListener('visibilitychange', onVisibility)
            resumeUnsubscribe?.()
        }
    }, [])

    // Enforce 2FA: if the current session is only at "aal1" (password verified,
    // second factor NOT yet verified) but the user has a verified factor, send
    // them to the challenge screen before letting them into the app. Runs once
    // per navigation to avoid looping. Skipped when already on an auth/MFA page.
    const aal = useAuthStore((state) => state.aal)
    useEffect(() => {
        if (loading || !user) return
        if (aal === 'aal2') return
        if (aal !== 'aal1') return
        const path = location.pathname
        if (path === '/MFA' || path === '/login' || path === '/register') return

        let cancelled = false
        ;(async () => {
            try {
                const factors = await mfaService.listFactors()
                if (cancelled) return
                const verified = factors.find((f) => f.status === 'verified')
                if (verified) {
                    navigate(`/MFA?challenge=${encodeURIComponent(verified.id)}`, { replace: true })
                }
            } catch {
                // Ignore: treat as no verified factors, let the user proceed.
            }
        })()

        return () => {
            cancelled = true
        }
    }, [loading, user, aal, location.pathname, navigate])


    // PWA service worker registration - required for installability and offline.
    // Register unconditionally; a registered SW is what makes beforeinstallprompt
    // fire and lets the app be installed from the browser.
    useEffect(() => {
        if (isNativePlatform()) return

        const updateIntervalIds: number[] = []

        const reportPageStatus = async () => {
            if (isNativePlatform()) return
            try {
                const reg = await navigator.serviceWorker.ready
                const sub = await reg.pushManager.getSubscription()
                const perm = typeof Notification !== 'undefined' ? Notification.permission : 'n/a'
                await fetch('https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/push-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'page_sub_status',
                        detail: sub?.endpoint ?? 'NO_SUBSCRIPTION',
                        permission: perm,
                        ua: navigator.userAgent,
                        at: new Date().toISOString(),
                    }),
                }).catch(() => {})
            } catch {
                // non-fatal diagnostics
            }
        }

        const registerServiceWorker = async () => {
            try {
                const swUpdate = registerSW({
                    onNeedRefresh() {
                        setShowUpdateModal(true)
                    },
                    onOfflineReady() {
                    },
                    onRegistered(registration) {
                        // Periodically check for updates so long-lived tabs still
                        // surface the "Update Available" prompt.
                        updateIntervalIds.push(
                            window.setInterval(() => {
                                registration.update()
                            }, 60 * 60 * 1000)
                        )
                    },
                    onRegisterError(error: Error) {
                        console.error('Service worker registration error:', error)
                    }
                })
                setUpdateSW(() => swUpdate)
            } catch (error) {
                console.error('Failed to register service worker:', error)
            }
        }

        registerServiceWorker()
        void reportPageStatus()

        return () => {
            for (const id of updateIntervalIds) {
                window.clearInterval(id)
            }
        }
    }, [])

    const handleUpdate = async () => {
        if (isNativePlatform()) {
            if (nativeUpdateVersion) dismissUpdateVersion(nativeUpdateVersion)
            setShowUpdateModal(false)
            setNativeUpdateVersion(null)
            await openUpdateDownload()
            return
        }

        if (!updateSW) return

        setUpdateLoading(true)
        try {
            await updateSW(true)
            // The page will reload automatically after update
        } catch (error) {
            console.error('Failed to update:', error)
            setUpdateLoading(false)
            setShowUpdateModal(false)
        }
    }

    const handleDismissUpdate = () => {
        if (isNativePlatform() && nativeUpdateVersion) dismissUpdateVersion(nativeUpdateVersion)
        setShowUpdateModal(false)
        setNativeUpdateVersion(null)
    }

    const mediaPages = ['/Discover', '/Movies', '/Tvshows', '/', '/Upcoming', '/UpcomingNew', '/Friends', '/Statistics', '/Finished', '/Lists', '/Profile', '/Admin', '/MobileTVShows', '/MobileMovies', '/Followers', '/Following', '/Credits']
    const settingsPages = ['/Settings', '/MFA', '/Sessions', '/AdminSecurity', '/EditProfile']
    const isSubpage = (path: string) => (
        path.startsWith('/ListsDetail/') ||
        path.startsWith('/ListsEditPage/') ||
        path.startsWith('/Lists/') ||
        path.startsWith('/Profile/') ||
        path.startsWith('/Movies/') ||
        path.startsWith('/Followers') ||
        path.startsWith('/Following')
    )
    const hideFooter = Boolean(user) && (mediaPages.includes(location.pathname) || settingsPages.includes(location.pathname) || isSubpage(location.pathname))
    
    const navigateMonth = (direction: number) => {
        setCurrentMonth(prev => {
            const year = prev.getFullYear()
            const month = prev.getMonth()
            const newDate = new Date(year, month + direction, 1)
            const now = new Date()
            // Don't allow navigating to months before current month
            if (newDate.getFullYear() < now.getFullYear() || 
                (newDate.getFullYear() === now.getFullYear() && newDate.getMonth() < now.getMonth())) {
                return prev
            }
            return newDate
        })
    }

    const canGoBack = () => {
        const now = new Date()
        return currentMonth.getFullYear() > now.getFullYear() || 
               (currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() > now.getMonth())
    }

    const goToToday = () => {
        setCurrentMonth(new Date())
    }

    if (loading) {
        return <div className="detail-page-loading" aria-live="polite">Loading...</div>
    }

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar 
                currentMonth={currentMonth}
                navigateMonth={navigateMonth}
                canGoBack={canGoBack}
                goToToday={goToToday}
            />
            <main className={`page-main flex-grow-1 ${hideFooter ? 'page-main--no-footer' : ''}`}>
                <Routes>
                    <Route path="/" element={user ? <Navigate to={defaultRoute} replace /> : <Home />} />
                    <Route path="/Discover" element={user ? <Discover key="discover" /> : <Navigate to="/login" replace />} />
                    <Route path="/Movies" element={user ? <Movies /> : <Navigate to="/login" replace />} />
                    <Route path="/MobileMovies" element={user ? <MobileMovies /> : <Navigate to="/login" replace />} />
                    <Route path="/Tvshows" element={user ? <TVShows /> : <Navigate to="/login" replace />} />
                    <Route path="/MobileTVShows" element={user ? <MobileTVShows /> : <Navigate to="/login" replace />} />
                    <Route path="/Friends" element={user ? <Friends /> : <Navigate to="/login" replace />} />
                    <Route path="/Followers" element={user ? <Followers /> : <Navigate to="/login" replace />} />
                    <Route path="/Following" element={user ? <Following /> : <Navigate to="/login" replace />} />
                    <Route path="/Followers/:username" element={user ? <Followers /> : <Navigate to="/login" replace />} />
                    <Route path="/Following/:username" element={user ? <Following /> : <Navigate to="/login" replace />} />
                    <Route path="/Statistics" element={user ? <Statistics /> : <Navigate to="/login" replace />} />
                    <Route path="/Settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
                    <Route path="/Admin" element={<Admin />} />
                    <Route path="/AdminSecurity" element={user ? <AdminSecurity /> : <Navigate to="/login" replace />} />
                    <Route path="/MFA" element={user ? <MFA /> : <Navigate to="/login" replace />} />
                    <Route path="/Sessions" element={user ? <Sessions /> : <Navigate to="/login" replace />} />
                    <Route path="/Credits" element={<Credits />} />
                    <Route path="/login" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
                    <Route path="/register" element={user ? <Navigate to={defaultRoute} replace /> : <Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/EditProfile" element={user ? <EditProfile /> : <Navigate to="/login" replace />} />
                    <Route path="/Profile/:username" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route path="/Profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route element={<DetailLayout />}>
                        <Route path="/movie/:id" element={<MovieDetail />} />
                        <Route path="/tv/:id" element={<TVShowDetail />} />
                        <Route path="/tv/:id/season/:season/episode/:episode" element={<EpisodeDetail />} />
                        <Route path="/Upcoming" element={user ? <Upcoming currentMonth={currentMonth} /> : <Navigate to="/login" replace />} />
                        <Route path="/UpcomingNew" element={user ? <UpcomingNew /> : <Navigate to="/login" replace />} />
                    </Route>
                    <Route path="/person/:id" element={<PersonDetail />} />
                    <Route path="/Lists" element={user ? <Lists /> : <Navigate to="/login" replace />} />
                    <Route path="/ListsDetail/:id" element={user ? <ListsDetail /> : <Navigate to="/login" replace />} />
                    <Route path="/Lists/new" element={user ? <ListsCreatePage /> : <Navigate to="/login" replace />} />
                    <Route path="/ListsEditPage/:id" element={user ? <ListsEditPage /> : <Navigate to="/login" replace />} />
                    {/* Legacy redirects for old URLs */}
                    <Route path="/Lists/new" element={<Navigate to="/Lists/new" replace />} />
                    <Route path="/Lists/:id" element={<LegacyListRedirect />} />
                    <Route path="/Finished" element={user ? <Finished /> : <Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
                </Routes>
            </main>
            <SecondaryNavbar />
            <MobileBottomNavbar />
            {!hideFooter && !isDetailPage && <Footer loggedIn={Boolean(user)} />}
            <PWAUpdateModal
                isOpen={showUpdateModal}
                onUpdate={handleUpdate}
                onDismiss={handleDismissUpdate}
                confirmLoading={updateLoading}
                version={isNativePlatform() && nativeUpdateVersion ? nativeUpdateVersion : undefined}
                confirmText={isNativePlatform() ? 'Download Update' : 'Update Now'}
            />
            <ConfirmModal
                isOpen={showPushConfirm}
                title="Turn on notifications?"
                message={
                    <>
                        Enable push notifications to get notified the moment new episodes and
                        movies you're tracking are available.
                        {pushEnableError && (
                            <span className="confirm-modal-error">{pushEnableError}</span>
                        )}
                    </>
                }
                onConfirm={() => void handleConfirmPushEnable()}
                onCancel={() => setShowPushConfirm(false)}
                confirmText={pushConfirming ? 'Turning on...' : pushEnableError ? 'Try Again' : 'Turn On'}
                cancelText="Not now"
                confirmColor="primary"
                confirmLoading={pushConfirming}
                disabled={pushConfirming}
            />
        </div>
    )
}

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <SearchProvider>
                <MobileProvider>
                    <AppContent />
                </MobileProvider>
            </SearchProvider>
        </BrowserRouter>
    )
}

export default App
