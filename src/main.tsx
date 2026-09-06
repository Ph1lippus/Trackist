import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNativePlatform } from './services/nativePush';
import 'bootstrap/dist/css/bootstrap.min.css';   
import './styles/global.css';                    

if (typeof document !== 'undefined') {
    const existing = document.getElementById('confirm-modal-root')
    if (!existing) {
        const root = document.createElement('div')
        root.id = 'confirm-modal-root'
        document.body.appendChild(root)
    }
}

if (typeof window !== 'undefined') {
    window.history.scrollRestoration = 'manual'
}

if (typeof document !== 'undefined' && isNativePlatform()) {
    document.documentElement.classList.add('native-app')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);