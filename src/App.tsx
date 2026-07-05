import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './services/supabaseClient'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

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

    return (
        <div className="d-flex flex-column min-vh-100">
            <Navbar />
            <main className="page-main flex-grow-1 d-flex align-items-center justify-content-center">
                {!showPageContent ? null : (
                    <Routes>
                        <Route path="/" element={user ? <Dashboard /> : <Home />} />
                        <Route path="/Login" element={
                            user ? <Navigate to="/" replace /> : <Login />
                        } />
                        <Route path="/Register" element={
                            user ? <Navigate to="/" replace /> : <Register />
                        } />
                    </Routes>
                )}
            </main>
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