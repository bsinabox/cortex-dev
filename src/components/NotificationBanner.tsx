'use client';

import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = 'BH95YWTCxZux2kbm8RLUaZp3kpgw8TuzW_JNyExtHnTOdcNnDWx-aXH8Q_LCrtI9TEYfbzron3O-xNqgh49ugYA';

type PushState = 'loading' | 'unsupported' | 'prompt' | 'subscribing' | 'subscribed' | 'denied';

export function NotificationBanner() {
  const [state, setState] = useState<PushState>('loading');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }

    try {
      if (sessionStorage.getItem('cortex-push-dismissed')) {
        setDismissed(true);
      }
    } catch { /* ignore */ }

    const permission = Notification.permission;
    if (permission === 'denied') {
      setState('denied');
      return;
    }

    if (permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setState('subscribed');
      } else {
        await doSubscribe();
      }
      return;
    }

    setState('prompt');
  }

  const doSubscribe = useCallback(async () => {
    setState('subscribing');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });

      if (response.ok) {
        setState('subscribed');
      } else {
        console.error('[Push] Subscribe API failed:', await response.text());
        setState('prompt');
      }
    } catch (err) {
      console.error('[Push] Subscribe error:', err);
      setState('prompt');
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('cortex-push-dismissed', '1'); } catch { /* */ }
  };

  if (state !== 'prompt' || dismissed) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
        <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      </div>
      <p className="min-w-0 flex-1 text-xs text-indigo-700 dark:text-indigo-300">
        Get notified when items need review or get blocked.
      </p>
      <button
        onClick={doSubscribe}
        className="shrink-0 rounded-[8px] bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Enable
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 p-1 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
        aria-label="Dismiss"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
