import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

const Home: React.FC = () => {
    usePageTitle('Track1st - Home')
    
    return (
        <main className="main">
            <section className="hero">
                <div className="container text-center">
                    <h1 className="hero__title">Track what you watch</h1>
                    <hr className="hero-divider" />
                    <p className="hero__subtitle">Movies. TV shows. All in one place.</p>
                    <Link to="/Register" className="btn btn-primary btn-lg">Get Started</Link>
                </div>
            </section>
        </main>
    );
};

export default Home;