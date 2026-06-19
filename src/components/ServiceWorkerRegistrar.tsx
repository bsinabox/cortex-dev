'use client';

import { useEffect, useRef } from 'react';

export function ServiceWorkerRegistrar() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
