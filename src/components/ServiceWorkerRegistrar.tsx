'use client';

import { useEffect, useRef } from 'react';

export function ServiceWorkerRegistrar() {
  const attempted = useRef(false);
  const hadController = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if ('serviceWorker' in navigator) {
      // One-time auto-reload when a new SW takes control after a deploy.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only reload if a controller existed before (i.e. an update, not the
        // very first install) and we haven't already reloaded this cycle.
        if (!hadController.current) return;
        if (sessionStorage.getItem('sw-reloaded') === '1') return;
        sessionStorage.setItem('sw-reloaded', '1');
        window.location.reload();
      });

      const buildId = process.env.NEXT_PUBLIC_BUILD_ID;
      hadController.current = Boolean(navigator.serviceWorker.controller);

      navigator.serviceWorker
        .register(`/sw.js?v=${buildId}`, { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);
          // Prompt an immediate update check so a new build is picked up fast.
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
