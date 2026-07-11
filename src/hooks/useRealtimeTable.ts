'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

// Singleton client to prevent subscription churn (Codex finding #3)
let sharedClient: ReturnType<typeof createBrowserClient> | null = null;
function getClient() {
  if (!sharedClient) {
    sharedClient = createBrowserClient();
  }
  return sharedClient;
}

// Debounce window for realtime updates. Buffering + flushing at most this often
// keeps a busy table (e.g. agentic_items with 130+ rows and a live subscription)
// from firing a setState per change, which would re-render continuously and
// starve in-flight router.push navigation transitions.
const FLUSH_INTERVAL_MS = 750;

// Stable content signature over id (+ updated_at when present). Used to decide
// whether an incoming `initialData` reflects genuinely new server data or is just
// a fresh array literal produced by a parent re-render (e.g. PipelineBoard spreads
// a new array every render). Only a real content change should reset local state.
function computeSignature<T extends Record<string, unknown>>(
  rows: T[],
  idField: string
): string {
  return rows
    .map((row) => {
      const id = row[idField];
      const updated =
        'updated_at' in row ? row.updated_at : undefined;
      return `${String(id)}:${updated === undefined ? '' : String(updated)}`;
    })
    .join('|');
}

type ChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

// Apply a single postgres change to the current rows, preserving the original
// INSERT / UPDATE / DELETE / soft-insert semantics. Written as a pure reducer so a
// buffer of changes can be replayed in order during a debounced flush.
function applyChange<T extends Record<string, unknown>>(
  prev: T[],
  payload: ChangePayload,
  keyField: string
): T[] {
  const newRow = payload.new;
  const oldRow = payload.old;
  switch (payload.eventType) {
    case 'INSERT': {
      // Idempotent: a buffered flush (or an INSERT for a row already in
      // initialData) must not create a duplicate.
      const exists = prev.some((row) => row[keyField] === newRow[keyField]);
      return exists
        ? prev.map((row) =>
            row[keyField] === newRow[keyField] ? (newRow as T) : row
          )
        : [...prev, newRow as T];
    }
    case 'UPDATE': {
      const exists = prev.some((row) => row[keyField] === newRow[keyField]);
      if (exists) {
        return prev.map((row) =>
          row[keyField] === newRow[keyField] ? (newRow as T) : row
        );
      }
      // Row transitioned into a matching state — treat as a soft-insert.
      return [...prev, newRow as T];
    }
    case 'DELETE':
      return prev.filter((row) => row[keyField] !== oldRow[keyField]);
    default:
      return prev;
  }
}

export function useRealtimeTable<T extends Record<string, unknown>>(
  table: string,
  initialData: T[],
  filter?: string,
  idField: string = 'id'
) {
  const [data, setData] = useState<T[]>(initialData);
  const clientRef = useRef(getClient());
  const idFieldRef = useRef(idField);

  // Track the signature of the last server data we applied so a mere reference
  // change to `initialData` (new array literal, same content) does NOT reset.
  const signatureRef = useRef<string | null>(null);
  if (signatureRef.current === null) {
    signatureRef.current = computeSignature(initialData, idFieldRef.current);
  }

  // Reset data only when initialData genuinely changes (e.g. filter change from
  // server), not on every parent re-render.
  useEffect(() => {
    const sig = computeSignature(initialData, idFieldRef.current);
    if (sig !== signatureRef.current) {
      signatureRef.current = sig;
      setData(initialData);
    }
  }, [initialData]);

  // Buffer realtime changes and flush them in batches to avoid a re-render storm.
  const bufferRef = useRef<ChangePayload[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = clientRef.current;
    const keyField = idFieldRef.current;

    const flush = () => {
      flushTimerRef.current = null;
      if (bufferRef.current.length === 0) return;
      const pending = bufferRef.current;
      bufferRef.current = [];
      setData((prev) =>
        pending.reduce((acc, p) => applyChange(acc, p, keyField), prev)
      );
    };

    const channel = supabase
      .channel(`${table}-realtime`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          bufferRef.current.push({
            eventType: payload.eventType,
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          });
          if (flushTimerRef.current === null) {
            flushTimerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
          }
        }
      )
      .subscribe();

    return () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Apply anything still buffered so a subscription teardown does not drop
      // in-flight changes.
      if (bufferRef.current.length > 0) {
        const pending = bufferRef.current;
        bufferRef.current = [];
        setData((prev) =>
          pending.reduce((acc, p) => applyChange(acc, p, keyField), prev)
        );
      }
      supabase.removeChannel(channel);
    };
  }, [table, filter]);

  const refresh = useCallback(async () => {
    const supabase = clientRef.current;
    const query = supabase.from(table).select('*');
    const { data: fresh } = await query;
    if (fresh) {
      signatureRef.current = computeSignature(fresh as T[], idFieldRef.current);
      setData(fresh as T[]);
    }
  }, [table]);

  return { data, refresh };
}
