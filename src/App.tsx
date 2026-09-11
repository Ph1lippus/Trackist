import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { updateLastActive } from './services/profileService'
import { initializeAuth, useAuthStore } from './stores/useAuthStore'
import { SearchProvider } from './contexts/SearchContext'
import { MobileProvider } from './contexts/MobileProvider'
import { useLibraryStore } from './stores/useLibraryStore'
import { registerSW } from 'virtual:pwa-register'
import { App as CapacitorApp } from '@capacitor/app'
import { initNativePush, isNativePlatform } from './services/nativePush'
import {
    getInstalledVersionCode,
    getLatestVersionManifest,
    openUpdateDownload,
    getUpdateDismissed,
    dismissUpdateVersion,
} from './services/nativeUpdate'
import { invalidateCalendarCache } from './services/calendarService'
import { supabase } from './services/supabaseClient'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import SecondaryNavbar from './components/layout/SecondaryNavbar'
import MobileBottomNavbar from './components/layout/MobileBottomNavbar'
import DetailSidebarToggle from './components/layout/DetailSidebarToggle'
import PWAUpdateModal from './components/modals/PWAUpdateModal'
import DetailOverlay from './components/layout/DetailOverlay'
import ScrollToTop from './components/layout/ScrollToTop'
import Login from './pages/Login'
import Register from './pages/Register'
import Discover from './pages/Discover'
import Search from './pages/Search'
import Movies from './pages/Movies'
import TVShows from './pages/TVShows'
import Upcoming from './pages/Upcoming'
import UpcomingNew from './pages/UpcomingNew'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Followers from './pages/Followers'
import Following from './pages/Following'
import Statistics from './pages/Statistics'
import Credits from './pages/Credits'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Admin from './pages/Admin'
import MovieDetail from './pages/MovieDetail'
import TVShowDetail from './pages/TVShowDetail'
import PersonDetail from './pages/PersonDetail'
import EpisodeDetail from './pages/EpisodeDetail'
import Lists from './pages/Lists'
import ListsDetail from './pages/ListsDetail'
import ListsEditPage from './pages/ListsEditPage'
import ListsCreatePage from './pages/ListsCreatePage'
import MobileTVShows from './pages/MobileTVShows'
import MobileMovies from './pages/MobileMovies'
import DetailLayout from './components/layout/DetailLayout'
import MFA from './pages/MFA'
import Sessions from './pages/Sessions'
import AdminSecurity from './pages/AdminSecurity'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import About from './pages/About'
import Contact from './pages/Contact'
import { useSessionSecurity } from './hooks/useSessionSecurity'
import { useDailyTVSync } from './hooks/useDailyTVSync'
import ErrorBoundary from './components/ErrorBoundary'
import mfaService from './services/mfaService'
import useDetailModalStore, { restoreDetailModal } from './stores/detailModalStore'

const LegacyListRedirect: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    return <Navigate to={`/ListsDetail/${id}`} replace />
}

// Keyed route wrappers: forcing a fresh mount whenever the route params change
// so the previous show/movie's state, episodes and caches never leak into the
// newly opened share while its data is being fetched.
const MovieDetailRoute: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
    const { id } = useParams<{ id: string }>()
    return <MovieDetail key={id} onLoaded={onLoaded} />
}

const TVShowDetailRoute: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
    const { id } = useParams<{ id: string }>()
    return <TVShowDetail key={id} onLoaded={onLoaded} />
}

const EpisodeDetailRoute: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
    const { id, season, episode } = useParams<{ id: string; season: string; episode: string }>()
    return <EpisodeDetail key={`${id}-${season}-${episode}`} onLoaded={onLoaded} />
}

const AppContent: React.FC = () => {
    const location = useLocation()
    const isPersonPage = Boolean(location.pathname.match(/^\/person\/\d+$/))
    const navigate = useNavigate()
    const user = useAuthStore((state) => state.user)
    const loading = useAuthStore((state) => state.loading)
    const approved = useAuthStore((state) => state.approved)
    const approvalLoading = useAuthStore((state) => state.approvalLoading)
    const isModalOpen = useDetailModalStore((state) => state.isOpen)
    // Keep the routed page hidden while the overlay is fading out too, so it
    // doesn't reappear before the modal has finished closing.
    const isModalExiting = useDetailModalStore((state) => state.isExiting)
    const isModalVisible = isModalOpen || isModalExiting
    const modalResetKey = useDetailModalStore((state) =>
        state.isOpen ? `${state.type ?? ''}-${state.id ?? ''}` : 'closed'
    )
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const hasUpdatedLastActive = useRef(false)
    const hasRestoredModal = useRef(false)
    const [showUpdateModal, setShowUpdateModal] = useState(false)
    const [updateLoading, setUpdateLoading] = useState(false)
    const [updateError, setUpdateError] = useState<string | null>(null)
    const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null)
    const [nativeUpdateVersion, setNativeUpdateVersion] = useState<string | null>(null)

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

    // Routed detail pages that paint a full-viewport backdrop (movie, TV,
    // episode). A full-screen cover matching the site background is held over
    // the page until these report ready, so the reveal happens as one unit
    // behind the transparent navbar — no color split mid-transition.
    const isBackdropDetailPage = Boolean(location.pathname.match(/^\/(movie|tv)\/\d+$/) || location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/))
    const [detailCoverRevealed, setDetailCoverRevealed] = useState(false)

    // Collapse the reveal cover back to opaque whenever the route changes
    // (adjusting state during render, per the React docs). Each new detail-page
    // navigation starts covered until that page signals readiness via onLoaded.
    const [coverPath, setCoverPath] = useState(location.pathname)
    if (coverPath !== location.pathname) {
        setCoverPath(location.pathname)
        setDetailCoverRevealed(false)
    }

    useEffect(() => {
        void initializeAuth()
    }, [])

    // Safety timeout: if a detail page never calls onLoaded (e.g. its backdrop
    // fails to finish painting) the cover lifts anyway so the UI isn't stuck
    // behind it. The route change above already reset it to opaque.
    useEffect(() => {
        if (!isBackdropDetailPage) return
        const t = window.setTimeout(() => setDetailCoverRevealed(true), 3500)
        return () => window.clearTimeout(t)
    }, [location.pathname, isBackdropDetailPage])

    const handleDetailCoverLoaded = useCallback(() => {
        setDetailCoverRevealed(true)
    }, [])

    useEffect(() => {
        if (isMobile && isPWA) {
            document.documentElement.classList.add('pwa-mobile')
        } else {
            document.documentElement.classList.remove('pwa-mobile')
        }
    }, [isMobile, isPWA])

    useEffect(() => {
        document.documentElement.classList.add('hide-scrollbar')
    }, [])

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

    // Restore the detail modal that was open before a refresh. The modal never
    // changes the URL (it pins the underlying page), so a refresh lands back on
    // that page; this re-opens the saved modal stack on top of it.
    useEffect(() => {
        if (loading || !user || approved !== true) return
        if (hasRestoredModal.current) return
        hasRestoredModal.current = true
        restoreDetailModal()
    }, [loading, user, approved])

    // Notifications are delivered server-side by the hourly cron
    // (supabase/functions/notify-new-content). No client-side trigger needed.

    // Session security (auto-refresh, inactivity timeout, device tracking)
    useSessionSecurity()

    // Once-per-UTC-day background sweep: keeps the "episodes left" badge accurate
    // and flips caught_up shows back to watching when a new episode has aired.
    useDailyTVSync(user?.id ?? null)

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

    // Native (Capacitor) deep links: open shared https://track1st.vercel.app
    // links straight into the app and route to the matching screen.
    useEffect(() => {
        if (!isNativePlatform()) return

        const handleUrl = (urlData: { url?: string }): void => {
            if (!urlData?.url) return
            try {
                const target = new URL(urlData.url)
                navigate(target.pathname + target.search)
            } catch {
                // Ignore malformed urls
            }
        }

        let unsubscribe: (() => void) | undefined
        void CapacitorApp.getLaunchUrl().then((res) => {
            if (res?.url) handleUrl(res)
        })
        void CapacitorApp.addListener('appUrlOpen', handleUrl).then((handle) => {
            unsubscribe = () => void handle.remove()
        })

        return () => unsubscribe?.()
    }, [navigate])

    // Native push must be enabled manually from Settings; the app should not
    // force a permission prompt on first launch.

    // Native (Capacitor) update check: compare installed version against the
    // latest android-latest release and surface the Update Available modal.
    // Checks once when the app is opened and again when the user manually taps
    // "Check for updates" in Settings. No background polling or auto-retry.
    useEffect(() => {
        if (!isNativePlatform()) return

        let cancelled = false

        const check = async (opts?: { force?: boolean }): Promise<void> => {
            if (cancelled) return

            const [installed, latestManifest] = await Promise.all([
                getInstalledVersionCode(),
                getLatestVersionManifest(),
            ])
            if (cancelled) return
            if (!latestManifest) return
            if (!(latestManifest.versionCode > installed)) return
            if (!opts?.force && getUpdateDismissed(latestManifest.versionName)) return
            setNativeUpdateVersion(latestManifest.versionName)
            setShowUpdateModal(true)
        }
        const onCheckUpdate = (): void => {
            void check({ force: true })
        }

        void check()
        window.addEventListener('track1st:check-update', onCheckUpdate)

        return () => {
            cancelled = true
            window.removeEventListener('track1st:check-update', onCheckUpdate)
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
            setUpdateLoading(true)
            setUpdateError(null)
            const result = await openUpdateDownload()
            setUpdateLoading(false)
            if (result === 'started') {
                if (nativeUpdateVersion) dismissUpdateVersion(nativeUpdateVersion)
                setShowUpdateModal(false)
                setNativeUpdateVersion(null)
            } else if (result === 'permission-needed') {
                setUpdateError('The update could not be started. In Android settings, allow Track1st to \u201cInstall unknown apps\u201d, then try again.')
            } else {
                setUpdateError('The update could not be downloaded or started. Check your connection and try again.')
            }
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

    const mediaPages = ['/Discover', '/Movies', '/Tvshows', '/', '/Upcoming', '/UpcomingNew', '/Lists', '/Profile', '/Admin', '/MobileTVShows', '/MobileMovies', '/Followers', '/Following', '/Search', '/Statistics']
    const settingsPages = ['/Settings', '/MFA', '/Sessions', '/AdminSecurity',
        '/Settings/account', '/Settings/profile', '/Settings/security', '/Settings/notifications',
        '/Settings/app', '/Settings/data', '/Settings/additions', '/Settings/danger']
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

    if (user && approvalLoading) {
        return <div className="detail-page-loading" aria-live="polite">Checking account approval...</div>
    }

    if (user && approved === false) {
        return (
            <main className="main">
                <div className="auth-layout">
                    <div className="auth-card approval-pending-card">
                        <h2 className="auth-title">Account Pending Approval</h2>
                        <p className="auth-text">An administrator needs to approve your account before you can use Trackist.</p>
                        <button className="auth-submit-btn" onClick={() => void supabase.auth.signOut()}>
                            Sign out
                        </button>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar 
                currentMonth={currentMonth}
                navigateMonth={navigateMonth}
                canGoBack={canGoBack}
                goToToday={goToToday}
            />
            {isBackdropDetailPage && !isModalVisible && (
                <div className={`detail-page-cover${detailCoverRevealed ? ' detail-page-cover--hidden' : ''}`} aria-hidden="true" />
            )}
            <main className={`page-main flex-grow-1 ${hideFooter ? 'page-main--no-footer' : ''}${isPersonPage ? ' person-page' : ''}${isModalVisible ? ' is-modal-backdrop-hidden' : ''}`} inert={isModalVisible || undefined}>
                <ErrorBoundary resetKey={location.pathname}>
                    <div key={location.pathname} className={`page-transition-wrapper${isBackdropDetailPage ? ' page-transition-wrapper--no-anim' : ''}`}>
                    <Routes>
                    <Route path="/" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
                    <Route path="/Discover" element={user ? <Discover key="discover" /> : <Navigate to="/login" replace />} />
                    <Route path="/Search" element={user ? <Search /> : <Navigate to="/login" replace />} />
                    <Route path="/Movies" element={user ? <Movies /> : <Navigate to="/login" replace />} />
                    <Route path="/MobileMovies" element={user ? <MobileMovies /> : <Navigate to="/login" replace />} />
                    <Route path="/Tvshows" element={user ? <TVShows /> : <Navigate to="/login" replace />} />
                    <Route path="/MobileTVShows" element={user ? <MobileTVShows /> : <Navigate to="/login" replace />} />
                    <Route path="/Followers" element={user ? <Followers /> : <Navigate to="/login" replace />} />
                    <Route path="/Following" element={user ? <Following /> : <Navigate to="/login" replace />} />
                    <Route path="/Followers/:username" element={user ? <Followers /> : <Navigate to="/login" replace />} />
                    <Route path="/Following/:username" element={user ? <Following /> : <Navigate to="/login" replace />} />
                    <Route path="/Statistics" element={user ? <Statistics /> : <Navigate to="/login" replace />} />
                    <Route path="/Settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
                    <Route path="/Settings/:section" element={user ? <Settings /> : <Navigate to="/login" replace />} />
                    <Route path="/login" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
                    <Route path="/register" element={user ? <Navigate to={defaultRoute} replace /> : <Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/Profile/:username" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route path="/Profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route path="/credits" element={<Credits />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                    <Route path="/terms-of-service" element={<TermsOfService />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route element={<DetailLayout />}>
                        <Route path="/movie/:id" element={<MovieDetailRoute onLoaded={handleDetailCoverLoaded} />} />
                        <Route path="/tv/:id" element={<TVShowDetailRoute onLoaded={handleDetailCoverLoaded} />} />
                        <Route path="/tv/:id/season/:season/episode/:episode" element={<EpisodeDetailRoute onLoaded={handleDetailCoverLoaded} />} />
                        <Route path="/Upcoming" element={user ? <Upcoming currentMonth={currentMonth} /> : <Navigate to="/login" replace />} />
                        <Route path="/UpcomingNew" element={user ? <UpcomingNew /> : <Navigate to="/login" replace />} />
                    </Route>
                    <Route path="/person/:id" element={<PersonDetail />} />
                    <Route path="/Lists" element={user ? <Lists /> : <Navigate to="/login" replace />} />
                    <Route path="/ListsDetail/:id" element={user ? <ListsDetail /> : <Navigate to="/login" replace />} />
                    <Route path="/Lists/new" element={user ? <ListsCreatePage /> : <Navigate to="/login" replace />} />
                    <Route path="/ListsEditPage/:id" element={user ? <ListsEditPage /> : <Navigate to="/login" replace />} />
                    <Route path="/Lists/:id" element={<LegacyListRedirect />} />
                    <Route path="/Admin" element={<Admin />} />
                    <Route path="/AdminSecurity" element={user ? <AdminSecurity /> : <Navigate to="/login" replace />} />
                    <Route path="/MFA" element={user ? <MFA /> : <Navigate to="/login" replace />} />
                    <Route path="/Sessions" element={user ? <Sessions /> : <Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
                </Routes>
                </div>
                </ErrorBoundary>
                <ScrollToTop />
            </main>
            <SecondaryNavbar />
            <MobileBottomNavbar />
            <DetailSidebarToggle />
            <ErrorBoundary resetKey={modalResetKey}>
                <DetailOverlay />
            </ErrorBoundary>
            {!hideFooter && !isDetailPage && <Footer loggedIn={Boolean(user)} />}
            <PWAUpdateModal
                isOpen={showUpdateModal}
                onUpdate={handleUpdate}
                onDismiss={handleDismissUpdate}
                confirmLoading={updateLoading}
                error={updateError ?? undefined}
                version={isNativePlatform() && nativeUpdateVersion ? nativeUpdateVersion : undefined}
                confirmText={isNativePlatform() ? 'Download Update' : 'Update Now'}
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
