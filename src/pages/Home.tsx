import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

const Home: React.FC = () => {
    usePageTitle('Track1st - Home')
    
    return (
        <main className="main">
            <section className="hero">
                <div className="container text-center">
                    <h1 className="hero__title">Track1st</h1>
                    <hr className="hero-divider" />
                    <p className="hero__subtitle">Your personal media tracker. Sign in to get started.</p>
                    <div className="hero__auth-links">
                        <Link to="/login" className="btn btn-primary btn-lg">Login</Link>
                        <Link to="/register" className="btn btn-outline-primary btn-lg">Register</Link>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default Home;