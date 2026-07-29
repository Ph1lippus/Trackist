import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './services/supabaseClient'
import { updateLastActive } from './services/profileService'
import type { User } from '@supabase/supabase-js'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import SecondaryNavbar from './components/layout/SecondaryNavbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Discover from './pages/Discover'
import Movies from './pages/Movies'
import TVShows from './pages/TVShows'
import Upcoming from './pages/Upcoming'
import Settings from './pages/Settings'
import Credits from './pages/Credits'
import ForgotPassword from './pages/ForgotPassword'
import Profile from './pages/Profile'
import Friends from './pages/Friends'
import Statistics from './pages/Statistics'
import EditProfile from './pages/EditProfile'
import MovieDetail from './pages/MovieDetail'
import TVShowDetail from './pages/TVShowDetail'
import PersonDetail from './pages/PersonDetail'
import EpisodeDetail from './pages/EpisodeDetail'
import Lists from './pages/Lists'
import Finished from './pages/Finished'
import DetailLayout from './components/layout/DetailLayout'

const AppContent: React.FC = () => {
    const location = useLocation()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    const isDetailPage = location.pathname.match(/^\/(movie|tv|person)\/\d+$/) || location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/)

    useEffect(() => {
        let active = true
        let subscription: { unsubscribe: () => void } | undefined

        const initialiseAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()

                if (!active) return
                setUser(session?.user || null)

                const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
                    if (!active) return
                    setUser(nextSession?.user || null)
                })

                subscription = authSubscription
            } catch {
                if (active) {
                    setUser(null)
                }
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }

        void initialiseAuth()

        return () => {
            active = false
            subscription?.unsubscribe()
        }
    }, [])

    useEffect(() => {
        if (!loading && user) {
            void updateLastActive()
        }
    }, [loading, user])

    if (loading) {
        return (
            <div className="page-loader" aria-live="polite">
                <div className="page-loader__content">
                    <div className="page-loader__logo">TRACKIST</div>
                </div>
            </div>
        )
    }

    const mediaPages = ['/Discover', '/Movies', '/Tvshows', '/', '/Upcoming', '/Friends', '/Statistics', '/Finished']
    const hideFooter = Boolean(user) && mediaPages.includes(location.pathname)

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar />
            <main className={`page-main flex-grow-1 ${hideFooter ? 'page-main--no-footer' : ''}`}>
                <Routes>
                    <Route path="/" element={user ? <Discover key="discover" /> : <Home />} />
                    <Route path="/Discover" element={user ? <Discover key="discover" /> : <Navigate to="/login" replace />} />
                    <Route path="/Movies" element={user ? <Movies /> : <Navigate to="/login" replace />} />
                    <Route path="/Tvshows" element={user ? <TVShows /> : <Navigate to="/login" replace />} />
                    <Route path="/Upcoming" element={user ? <Upcoming /> : <Navigate to="/login" replace />} />
                    <Route path="/Friends" element={user ? <Friends /> : <Navigate to="/login" replace />} />
                    <Route path="/Statistics" element={user ? <Statistics /> : <Navigate to="/login" replace />} />
                    <Route path="/Settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
                    <Route path="/Credits" element={<Credits />} />
                    <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
                    <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/EditProfile" element={user ? <EditProfile /> : <Navigate to="/login" replace />} />
                    <Route path="/Profile/:username" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route path="/Profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
                    <Route element={<DetailLayout />}>
                    <Route path="/movie/:id" element={<MovieDetail />} />
                    <Route path="/tv/:id" element={<TVShowDetail />} />
                    <Route path="/tv/:id/season/:season/episode/:episode" element={<EpisodeDetail />} />
                    </Route>
                    <Route path="/person/:id" element={<PersonDetail />} />
                    <Route path="/lists" element={user ? <Lists /> : <Navigate to="/login" replace />} />
                    <Route path="/Finished" element={user ? <Finished /> : <Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
                </Routes>
            </main>
            <SecondaryNavbar />
            {!hideFooter && !isDetailPage && <Footer />}
        </div>
    )
}

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    )
}

export default App