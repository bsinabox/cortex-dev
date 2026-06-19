'use client';

import { useEffect, useRef } from 'react';

const VAPID_PUBLIC_KEY = 'BH95YWTCxZux2kbm8RLUaZp3kpgw8TuzW_JNyExtHnTOdcNnDWx-aXH8Q_LCrtI9TEYfbzron3O-xNqgh49ugYA';

export function ServiceWorkerRegistrar() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerAndSubscribe();
    }
  }, []);

  return null;
}

async function registerAndSubscribe() {
  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Registered:', registration.scope);

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      console.log('[Push] Already subscribed');
      // Re-sync subscription to server in case it was lost
      await syncSubscription(existing);
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Permission denied:', permission);
      return;
    }

    // Subscribe with VAPID key
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await syncSubscription(subscription);
    console.log('[Push] Subscribed successfully');
  } catch (err) {
    console.error('[Push] Registration error:', err);
  }
}

async function syncSubscription(subscription: PushSubscription) {
  try {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      console.error('[Push] Invalid subscription — missing keys');
      return;
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[Push] Sync failed:', err);
    }
  } catch (err) {
    console.error('[Push] Sync error:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
