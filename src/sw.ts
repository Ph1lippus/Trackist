import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()
self.skipWaiting()

// SPA navigation fallback to the precached shell
registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL('/index.html'),
    { denylist: [/^\/api/, /^\/auth/] }
  )
)

// TMDB API - NetworkFirst with short-lived cache
registerRoute(
  ({ url }) => url.hostname === 'api.themoviedb.org',
  new NetworkFirst({
    cacheName: 'tmdb-api-cache',
    networkTimeoutSeconds: 15,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// TMDB images - CacheFirst with long-lived cache
registerRoute(
  ({ url }) => url.hostname === 'image.tmdb.org',
  new CacheFirst({
    cacheName: 'tmdb-image-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// Supabase edge functions - never cache
registerRoute(
  ({ url }) => url.hostname.endsWith('supabase.co') && url.pathname.includes('/functions/v1/'),
  new NetworkOnly({ cacheName: 'supabase-api-cache' })
)

// Supabase API - NetworkFirst, short-lived
registerRoute(
  ({ url }) => url.hostname.endsWith('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 5 }),
    ],
  })
)

interface PushData {
  title: string
  body: string
  url: string
  tag?: string
  icon?: string
}

self.addEventListener('push', (event) => {
  let data: PushData = { title: 'Trackist', body: '', url: '/' }
  try {
    const parsed = event.data?.json()
    if (parsed && typeof parsed === 'object') {
      data = {
        title: typeof parsed.title === 'string' ? parsed.title : data.title,
        body: typeof parsed.body === 'string' ? parsed.body : '',
        url: typeof parsed.url === 'string' ? parsed.url : '/',
        tag: typeof parsed.tag === 'string' ? parsed.tag : undefined,
        icon: typeof parsed.icon === 'string' ? parsed.icon : undefined,
      }
    }
  } catch {
    const fallbackText = event.data?.text()
    if (fallbackText) {
      data = { title: 'Trackist', body: fallbackText, url: '/' }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: data.icon || '/TRACK1ST-FULLNAMELGO.png',
      badge: '/TRACK1ST-FULLNAMELGO.png',
      data: { url: data.url },
      renotify: !!data.tag,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).toString()

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client && 'navigate' in client) {
            void client.navigate(targetUrl)
            return client.focus()
          }
        }
        return self.clients.openWindow(targetUrl)
      })
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})