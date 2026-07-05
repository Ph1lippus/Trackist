import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './services/supabaseClient'
import { updateLastActive } from './services/profileService'
import type { User } from '@supabase/supabase-js'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Discover from './pages/Discover'
import Watchlist from './pages/Watchlist'
import More from './pages/More'
import Settings from './pages/Settings'
import Credits from './pages/Credits'
import ForgotPassword from './pages/ForgotPassword'

const PageLoader: React.FC<{ show: boolean; stage: 'enter' | 'exit' | 'hidden' }> = ({ show, stage }) => {
    if (!show) return null

    return (
        <div className={`page-loader page-loader--${stage}`} aria-live="polite">
            <div className="page-loader__content">
                <div className="page-loader__logo">TRACKIST</div>
            </div>
        </div>
    )
}

const AppContent: React.FC = () => {
    const location = useLocation()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [loaderStage, setLoaderStage] = useState<'enter' | 'exit' | 'hidden'>('hidden')
    const [showPageContent, setShowPageContent] = useState(true)

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

    useEffect(() => {
        if (loading) return

        setShowPageContent(false)
        setLoaderStage('enter')

        const showTimer = window.setTimeout(() => {
            setShowPageContent(true)
            setLoaderStage('exit')
        }, 700)
        const hideTimer = window.setTimeout(() => setLoaderStage('hidden'), 900)

        return () => {
            window.clearTimeout(showTimer)
            window.clearTimeout(hideTimer)
        }
    }, [location.pathname, loading])

    if (loading) {
        return (
            <div className="page-loader page-loader--enter" aria-live="polite">
                <div className="page-loader__content">
                    <div className="page-loader__logo">TRACKIST</div>
                </div>
            </div>
        )
    }

    const authPage = ['/login', '/register'].includes(location.pathname)
    const showBottomNav = Boolean(user) && !authPage
    const mediaPages = ['/discover', '/watchlist', '/']
    const hideFooter = Boolean(user) && mediaPages.includes(location.pathname)

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar />
            <main className={`page-main flex-grow-1 ${hideFooter ? 'page-main--no-footer' : ''}`}>
                {!showPageContent ? null : (
                    <Routes>
                        <Route path="/" element={user ? <Dashboard /> : <Home />} />
                        <Route path="/discover" element={user ? <Discover /> : <Navigate to="/login" replace />} />
                        <Route path="/watchlist" element={user ? <Watchlist /> : <Navigate to="/login" replace />} />
                        <Route path="/more" element={user ? <More /> : <Navigate to="/login" replace />} />
                        <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
                        <Route path="/credits" element={<Credits />} />
                        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
                        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
                        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />  
                    </Routes>
                )}
            </main>
            {showBottomNav ? <BottomNav /> : null}
            {!hideFooter && <Footer />}
            <PageLoader show={loaderStage !== 'hidden'} stage={loaderStage} />
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