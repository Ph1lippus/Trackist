import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';
import ProgressFixModal from '../modals/ProgressFixModal';

const Navbar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState<User | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [showFixModal, setShowFixModal] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const isDetailPage = location.pathname.match(/^\/(movie|tv|person)\/\d+$/) || 
                          location.pathname.match(/^\/tv\/\d+\/season\/\d+\/episode\/\d+$/);
    const showBackButton = Boolean(isDetailPage);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const closeMenu = useCallback(() => {
        setClosing(true);
        setTimeout(() => {
            setMenuOpen(false);
            setClosing(false);
        }, 150); // matches --dropdown-close-dur
    }, []);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)
            ) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeMenu]);

    const toggleMenu = useCallback(() => {
        if (menuOpen) {
            closeMenu();
        } else {
            setMenuOpen(true);
        }
    }, [menuOpen, closeMenu]);

    const handleLogout = async () => {
        closeMenu();
        // Ask for confirmation before logout
        if (window.confirm('Are you sure you want to logout?')) {
            await supabase.auth.signOut();
            navigate('/login');
        }
    };

    const nickname = user?.user_metadata?.username 
        || user?.user_metadata?.nickname 
        || user?.user_metadata?.full_name 
        || user?.email?.split('@')[0] 
        || 'Viewer';

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                <div className="navbar-left">
                    {showBackButton && (
                        <i
                            className="fa-solid fa-chevron-left navbar-back-btn"
                            onClick={() => {
                                sessionStorage.setItem('scrollPosition', window.scrollY.toString());
                                navigate(-1);
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Go back"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
                                    navigate(-1);
                                }
                            }}
                        />
                    )}
                </div>
                <div className="navbar-actions">
                    {user ? (
                        <>
                            <div className="navbar-user-wrap">
                                <NavLink 
                                    className="navbar-user" 
                                    to="/Profile"
                                    title={nickname}
                                >
                                    {nickname}
                                </NavLink>
                            </div>
                            <div className="t-dropdown-wrap">
                                <button
                                    ref={buttonRef}
                                    className="navbar-menu-btn"
                                    onClick={toggleMenu}
                                    aria-label="Menu"
                                    aria-expanded={menuOpen}
                                >
                                    <div className={`navbar-hamburger ${menuOpen ? 'is-active' : ''}`}>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                    </div>
                                </button>
                                <div
                                    ref={menuRef}
                                    className={`t-dropdown ${menuOpen ? (closing ? 'is-closing' : 'is-open') : ''}`}
                                    data-origin="top-right"
                                >
                                <button className="t-dropdown-item" onClick={() => {
                                        closeMenu();
                                        setShowFixModal(true);
                                    }}>
                                        <i className="fa-solid fa-wrench"></i>
                                        Fix Progress
                                    </button>
                                    <button className="t-dropdown-item" onClick={() => {
                                        closeMenu();
                                        navigate('/Settings');
                                    }}>
                                        <i className="fa-solid fa-gear"></i>
                                        Settings
                                    </button>
                                    <button className="t-dropdown-item" onClick={handleLogout}>
                                        <i className="fa-solid fa-right-from-bracket"></i>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/login"
                            >
                                Login
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/register"
                            >
                                Register
                            </NavLink>
                        </>
                    )}
                </div>
            </div>
            <ProgressFixModal
                isOpen={showFixModal}
                onClose={() => setShowFixModal(false)}
                onComplete={() => {
                    // Refresh the current page if on a watchlist page
                    window.dispatchEvent(new CustomEvent('watchlist-refresh'))
                }}
            />
        </nav>
    );
};

export default Navbar;
