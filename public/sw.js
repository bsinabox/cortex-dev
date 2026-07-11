/// <reference lib="webworker" />

const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'v1';
const CACHE_NAME = 'cortex-dev-' + SW_VERSION;

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

// Fetch — cache-first ONLY for immutable, content-hashed static assets.
// Everything else (documents, RSC/_next/data, prefetch, /api) passes straight
// to the network with NO respondWith so the SW never interferes with the
// App Router. Handling navigation/RSC here served cached HTML in place of RSC
// flight data, which silently killed all <Link>/router.push navigation.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GET; never touch navigations, RSC, pages, data, or API.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Immutable, content-hashed assets only — safe to cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(request, clone)); }
        return res;
      }).catch(() => new Response('', { status: 503 })))
    );
    return;
  }

  // EVERYTHING ELSE (documents, RSC/_next/data, /api, prefetch): do NOT
  // respondWith. Let it hit the network.
  return;
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

  const safeUrl = (targetUrl && targetUrl.startsWith('/') && !targetUrl.startsWith('//')) ? targetUrl : '/pipeline';

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
