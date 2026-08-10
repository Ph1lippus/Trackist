import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: '\u200b',
        short_name: 'Trackist',
        description: 'Track your movies, TV shows, and anime — all in one place.',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/', 
        icons: [
          {
            // SPLASH SCREEN LOGO: Placed at the top so the browser picks this high-res file first for launching
            src: '/TRACK1ST-FULLNAMELGO.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // PHONE ICON: Android uses this 'maskable' format for the phone home screen app grid
            src: '/android-chrome-512x512.png', 
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            // PHONE ICON: Standard fallback icon for smaller system UI display menus
            src: '/android-chrome-192x192.png', 
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any' 
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.themoviedb\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 15
            }
          },
          {
            urlPattern: /^https:\/\/webservice\.fanart\.tv\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fanart-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
})
