import React, { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { updateLastActive } from './services/profileService'
import { initializeAuth, useAuthStore } from './stores/useAuthStore'
import { SearchProvider } from './contexts/SearchContext'
import { MobileProvider } from './contexts/MobileProvider'
import { useLibraryStore } from './stores/useLibraryStore'
import { registerSW } from 'virtual:pwa-register'
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

// Legacy redirect component for /Lists/:id -> /ListsDetail/:id
const LegacyListRedirect: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    return <Navigate to={`/ListsDetail/${id}`} replace />
}

const AppContent: React.FC = () => {
    const location = useLocation()
    const user = useAuthStore((state) => state.user)
    const loading = useAuthStore((state) => state.loading)
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const hasUpdatedLastActive = useRef(false)
    const [showUpdateModal, setShowUpdateModal] = useState(false)
    const [updateLoading, setUpdateLoading] = useState(false)
    const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null)

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

    // PWA service worker registration - only for PWA context
    useEffect(() => {
        const registerServiceWorker = async () => {
            // Only register service worker and show updates in PWA mode
            if (!isPWA) {
                return
            }

            try {
                const swUpdate = registerSW({
                    onNeedRefresh() {
                        setShowUpdateModal(true)
                    },
                    onOfflineReady() {
                    },
                    onRegistered(_registration) {
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
    }, [])

    const handleUpdate = async () => {
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
        setShowUpdateModal(false)
    }

    const mediaPages = ['/Discover', '/Movies', '/Tvshows', '/', '/Upcoming', '/UpcomingNew', '/Friends', '/Statistics', '/Finished', '/Lists', '/Profile', '/Admin', '/MobileTVShows', '/MobileMovies', '/Followers', '/Following', '/Credits']
    const hideFooter = Boolean(user) && (mediaPages.includes(location.pathname) || location.pathname === '/Settings' || location.pathname.startsWith('/ListsDetail/') || location.pathname.startsWith('/ListsEditPage/') || location.pathname.startsWith('/Lists/') || location.pathname.startsWith('/Profile/') || location.pathname.startsWith('/Movies/') || location.pathname.startsWith('/Followers') || location.pathname.startsWith('/Following'))
    
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
            {!hideFooter && !isDetailPage && <Footer />}
            <PWAUpdateModal
                isOpen={showUpdateModal}
                onUpdate={handleUpdate}
                onDismiss={handleDismissUpdate}
                confirmLoading={updateLoading}
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
