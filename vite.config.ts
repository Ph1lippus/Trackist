import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: 'Track1st',
        short_name: 'Track1st',
        description: 'Track your movies, TV shows, and anime — all in one place.',
        theme_color: '#12121c',
        background_color: '#050505',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/', 
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/TRACK1ST-FULLNAMELGO.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/TRACK1ST-FULLNAMELGO.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]

      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['**/sw.js', '**/service-worker.js', '**/workbox-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
})
