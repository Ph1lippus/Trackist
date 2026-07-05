import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './services/supabaseClient'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation()
    const [phase, setPhase] = useState<'enter' | 'exit'>('enter')
    const [displayKey, setDisplayKey] = useState(location.pathname)

    useEffect(() => {
        setPhase('exit')

        const timeout = window.setTimeout(() => {
            setDisplayKey(location.pathname)
            setPhase('enter')
        }, 260)

        return () => window.clearTimeout(timeout)
    }, [location.pathname])

    return (
        <div key={displayKey} className={`page-transition ${phase}`}>
            {children}
        </div>
    )
}

const App: React.FC = () => {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)

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

    if (loading) {
        return <div>Loading...</div>
    }

    return (
        <BrowserRouter>
            <div className="d-flex flex-column min-vh-100">
                <Navbar />
                <main className="page-main flex-grow-1 d-flex align-items-center justify-content-center">
                    <PageTransition>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/Login" element={
                                user ? <Navigate to="/" replace /> : <Login />
                            } />
                            <Route path="/Register" element={
                                user ? <Navigate to="/" replace /> : <Register />
                            } />
                        </Routes>
                    </PageTransition>
                </main>
                <Footer />
            </div>
        </BrowserRouter>
    )
}

export default App