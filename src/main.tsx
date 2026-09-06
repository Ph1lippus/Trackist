import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNativePlatform } from './services/nativePush';
import 'bootstrap/dist/css/bootstrap.min.css';   
import './styles/global.css';                    

if (typeof window !== 'undefined') {
    window.history.scrollRestoration = 'manual';
}

// Tag <html> before first paint so the native (Capacitor) CSS overrides (e.g.
// non-fixed navbar, transparent status bar) apply from the very first frame —
// no flash of the fixed-navbar web layout inside the native wrapper.
if (typeof document !== 'undefined' && isNativePlatform()) {
    document.documentElement.classList.add('native-app');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);