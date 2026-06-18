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

export function useRealtimeTable<T extends Record<string, unknown>>(
  table: string,
  initialData: T[],
  filter?: string,
  idField: string = 'id'
) {
  const [data, setData] = useState<T[]>(initialData);
  const clientRef = useRef(getClient());
  const idFieldRef = useRef(idField);

  // Reset data when initialData changes (e.g. filter change from server)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const supabase = clientRef.current;
    const keyField = idFieldRef.current;
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
          setData((prev) => {
            const newRow = payload.new as Record<string, unknown>;
            const oldRow = payload.old as Record<string, unknown>;
            switch (payload.eventType) {
              case 'INSERT':
                return [...prev, newRow as T];
              case 'UPDATE': {
                const exists = prev.some(
                  (row) => row[keyField] === newRow[keyField]
                );
                if (exists) {
                  return prev.map((row) =>
                    row[keyField] === newRow[keyField] ? (newRow as T) : row
                  );
                }
                // Row transitioned into a matching state — treat as INSERT
                return [...prev, newRow as T];
              }
              case 'DELETE':
                return prev.filter(
                  (row) => row[keyField] !== oldRow[keyField]
                );
              default:
                return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);

  const refresh = useCallback(async () => {
    const supabase = clientRef.current;
    const query = supabase.from(table).select('*');
    const { data: fresh } = await query;
    if (fresh) setData(fresh as T[]);
  }, [table]);

  return { data, refresh };
}
