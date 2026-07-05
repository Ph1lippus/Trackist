import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';

const App: React.FC = () => {
    return (
        <BrowserRouter>
          <div className="d-flex flex-column min-vh-100">
              <Navbar />
              <main className="main flex-grow-1">
                  <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/Login" element={<Login />} />
                      <Route path="/Register" element={<Register />} />
                  </Routes>
              </main>
              <Footer />
          </div>
      </BrowserRouter>
    );
};

export default App;