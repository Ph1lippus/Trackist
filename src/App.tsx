import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './services/supabaseClient'
import { updateLastActive } from './services/profileService'
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
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [loaderStage, setLoaderStage] = useState<'enter' | 'exit' | 'hidden'>('hidden')
    const [showPageContent, setShowPageContent] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null)
        })

        return () => subscription.unsubscribe()
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

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar />
            <main className="page-main flex-grow-1 d-flex align-items-center justify-content-center">
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
                    </Routes>
                )}
            </main>
            {showBottomNav ? <BottomNav /> : null}
            <Footer />
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