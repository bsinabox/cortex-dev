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

export function useRealtimeTable<T extends { id: string }>(
  table: string,
  initialData: T[],
  filter?: string
) {
  const [data, setData] = useState<T[]>(initialData);
  const clientRef = useRef(getClient());

  // Reset data when initialData changes (e.g. filter change from server)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const supabase = clientRef.current;
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
            switch (payload.eventType) {
              case 'INSERT':
                return [...prev, payload.new as T];
              case 'UPDATE':
                return prev.map((row) =>
                  row.id === (payload.new as T).id ? (payload.new as T) : row
                );
              case 'DELETE':
                return prev.filter(
                  (row) => row.id !== (payload.old as { id: string }).id
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
