import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <footer className="footer">
            <div className="container">
                <div className="footer__top">
                    <span className="footer__brand">Trackist</span>
                    <button 
                        onClick={scrollToTop} 
                        className="footer__back-btn" 
                        aria-label="Back to top"
                    >
                        <i className="fas fa-chevron-up"></i>
                    </button>
                </div>

                <div className="footer__links">
                    <div className="footer__links-group">
                        <span className="footer__links-title">Pages</span>
                        <Link to="/">Home</Link>
                        <Link to="/login">Login</Link>
                        <Link to="/register">Register</Link>
                        <Link to="/credits">Credits</Link>
                    </div>
                    <div className="footer__links-group">
                        <span className="footer__links-title">About</span>
                        <a href="#">About Trackist</a>
                        <a href="#">Contact</a>
                    </div>
                    <div className="footer__links-group">
                        <span className="footer__links-title">Legal</span>
                        <a href="#">Privacy Policy</a>
                        <a href="#">Terms of Service</a>
                    </div>
                    <div className="footer__links-group">
                        <span className="footer__links-title">Connect</span>
                        <div className="footer__social">
                            <a href="https://github.com/Ph1lippus" target="_blank" aria-label="GitHub">
                                <i className="fab fa-github"></i>
                            </a>
                            <a href="https://www.linkedin.com/in/filipe-santos-7b2b70355/" target="_blank" aria-label="LinkedIn">
                                <i className="fab fa-linkedin-in"></i>
                            </a>
                            <a href="https://buymeacoffee.com/ph1lippus" target="_blank" aria-label="Buy Me a Coffee">
                                <i className="fas fa-mug-hot"></i>
                            </a>
                        </div>
                    </div>
                </div>

                <div className="footer__bottom">
                    <p className="footer__copyright">
                        &copy; 2026 <strong>Trackist</strong>. Open source. 
                        Built with ❤️ by <a href="https://github.com/Ph1lippus" target="_blank">Ph1lippus</a>
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;