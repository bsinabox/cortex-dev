'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/constants';

/* ─── Types ─── */

type Notification = {
  id: string;
  kind: 'ops' | 'status_change';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  detail: string | null;
  sid: string | null;
  itemId: string | null;
  timestamp: string;
};

/* ─── Severity colors ─── */

const SEV_DOT: Record<string, string> = {
  info: '#94a3b8',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
};

/* ─── Component ─── */

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    const supabase = createBrowserClient();

    // Recent ops_log entries (last 24h, most impactful)
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: ops } = await supabase
      .from('agentic_ops_log')
      .select('id, kind, severity, title, detail, item_id, created_at')
      .gte('created_at', cutoff)
      .in('severity', ['warning', 'error', 'critical'])
      .order('created_at', { ascending: false })
      .limit(30);

    // Items recently entering action-needed statuses (last 6h)
    const actionCutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data: items } = await supabase
      .from('agentic_items')
      .select('id, title, status, updated_at')
      .in('status', ['human_review', 'testing_in_dev', 'design_review_hold', 'promotion_review'])
      .gte('updated_at', actionCutoff)
      .order('updated_at', { ascending: false })
      .limit(20);

    const combined: Notification[] = [];

    for (const o of ops ?? []) {
      const sid = o.item_id ? (o.item_id as string).substring(0, 8).toUpperCase() : null;
      combined.push({
        id: o.id,
        kind: 'ops',
        severity: o.severity as Notification['severity'],
        title: o.title ?? 'Unknown event',
        detail: o.detail,
        sid,
        itemId: o.item_id,
        timestamp: o.created_at,
      });
    }

    for (const i of items ?? []) {
      const sid = (i.id as string).substring(0, 8).toUpperCase();
      const statusLabel: Record<string, string> = {
        human_review: 'Ready for review',
        testing_in_dev: 'Ready for testing',
        design_review_hold: 'Design review needed',
        promotion_review: 'Promotion review needed',
      };
      combined.push({
        id: `item-${i.id}`,
        kind: 'status_change',
        severity: 'info',
        title: statusLabel[i.status] ?? i.status,
        detail: i.title,
        sid,
        itemId: i.id,
        timestamp: i.updated_at,
      });
    }

    // Deduplicate by id and sort
    const seen = new Set<string>();
    const deduped = combined.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setNotifications(deduped.slice(0, 40));
  }, []);

  // Fetch on mount and every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Unread count
  const unreadCount = seenAt
    ? notifications.filter(n => new Date(n.timestamp) > new Date(seenAt)).length
    : notifications.length;

  // Mark all as seen
  const clearAll = () => {
    setSeenAt(new Date().toISOString());
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) {
            // Mark as seen when opening
            setSeenAt(new Date().toISOString());
          }
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--card)] transition-colors hover:bg-[var(--muted)] active:bg-[var(--muted)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg className="h-[18px] w-[18px] text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-out panel */}
      {open && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 flex h-dvh w-[min(85vw,360px)] flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-xl lg:absolute lg:right-0 lg:top-full lg:mt-2 lg:h-auto lg:max-h-[70vh] lg:w-[360px] lg:rounded-[12px] lg:border">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[11px] font-medium text-[var(--primary)] hover:underline"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="mb-2 h-8 w-8 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                  </svg>
                  <p className="text-xs text-[var(--muted-foreground)]">All clear — no notifications</p>
                </div>
              ) : (
                notifications.map(n => (
                  <NotificationRow key={n.id} notification={n} onClose={() => setOpen(false)} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Notification Row ─── */

function NotificationRow({ notification: n, onClose }: { notification: Notification; onClose: () => void }) {
  const dotColor = n.kind === 'status_change'
    ? '#14b8a6' // teal for action-ready
    : SEV_DOT[n.severity] ?? '#94a3b8';

  const inner = (
    <div className="flex gap-2.5 border-b border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--muted)]/50 active:bg-[var(--muted)]">
      <span
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: dotColor }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-snug">{n.title}</p>
        {n.detail && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            {n.detail}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
          {n.sid && (
            <span className="font-mono font-semibold text-[var(--primary)]">{n.sid}</span>
          )}
          <span>{timeAgo(n.timestamp)}</span>
        </div>
      </div>
    </div>
  );

  if (n.itemId) {
    return (
      <Link href={`/pipeline/${n.itemId}`} onClick={onClose}>
        {inner}
      </Link>
    );
  }
  return inner;
}
