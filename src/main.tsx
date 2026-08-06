import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';   
import './styles/global.css';                    
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App is ready for offline use')
  },
  onRegistered(registration) {
    console.log('Service worker registered:', registration)
  },
  onRegisterError(error: Error) {
    console.error('Service worker registration error:', error)
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);