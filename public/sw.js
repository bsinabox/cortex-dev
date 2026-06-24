/// <reference lib="webworker" />

const CACHE_NAME = 'cortex-dev-v1';

// Install — skip waiting (no pre-cache of SSR routes — they require auth)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches, then claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls — network first, cache fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        )
    );
    return;
  }

  // Static assets — cache first, store on miss
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Pages — network first, cache fallback (only cache successful responses)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) =>
          cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } })
        )
      )
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('Cortex Dev', {
        body: 'New notification',
        icon: '/icons/icon-192.png',
      })
    );
    return;
  }

  event.waitUntil(
    (async () => {
      try {
        const payload = event.data.json();
        const { title, body, data, tag } = payload;
        await self.registration.showNotification(title || 'Cortex Dev', {
          body: body || '',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: tag || 'cortex-dev',
          data: data || {},
          requireInteraction: data?.priority === 'high',
        });
      } catch (err) {
        console.error('[SW] Push parse error:', err);
        await self.registration.showNotification('Cortex Dev', {
          body: 'New notification',
          icon: '/icons/icon-192.png',
        });
      }
    })()
  );
});

// Notification click — open or focus app at the right URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/pipeline';

  const safeUrl = (targetUrl && targetUrl.startsWith('/')) ? targetUrl : '/pipeline';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.navigate(safeUrl).then(() => client.focus())
            .catch(() => self.clients.openWindow(safeUrl));
        }
      }
      return self.clients.openWindow(safeUrl);
    }).catch((err) => {
      console.error('[SW] Notification click error:', err);
    })
  );
});
