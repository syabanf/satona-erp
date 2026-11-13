/* Offline support: caches the app shell and every built file, then serves pages from the cache when the network is gone. */
const CACHE = 'wit-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/wit-logo.png', '/wit-logo-ink.png', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(SHELL)
      // Vite's build manifest lists every chunk, so all pages work offline, not only the ones already visited.
      const manifest = await fetch('/.vite/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      const files = [...new Set(Object.values(manifest).flatMap((m) => [m.file, ...(m.css ?? []), ...(m.assets ?? [])]).filter(Boolean).map((f) => `/${f}`))]
      await cache.addAll(files).catch(() => undefined)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // Pages: network first so a deploy shows at once, the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }
  // Built files never change under the same name, so the cache answers first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
