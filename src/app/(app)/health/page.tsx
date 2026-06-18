import { createServerClient } from '@/lib/supabase/server';

export default async function HealthPage() {
  const supabase = await createServerClient();

  const { data: config, error } = await supabase
    .from('agentic_config')
    .select('key, value')
    .in('key', ['mode', 'max_parallel_workers', 'test_gate_mode', 'last_heartbeat_at']);

  const configMap = (config ?? []).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        System health &amp; configuration — full dashboard coming in Phase 4
      </p>

      {error ? (
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Supabase read error</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Mode card */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Conductor Mode
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${
                configMap.mode === '"live"' ? 'bg-emerald-500' :
                configMap.mode === '"paused"' ? 'bg-amber-500' : 'bg-stone-400'
              }`} />
              <span className="text-lg font-semibold capitalize">
                {(configMap.mode ?? 'unknown').replace(/"/g, '')}
              </span>
            </div>
          </div>

          {/* Workers card */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Max Parallel Workers
            </p>
            <p className="mt-2 text-lg font-semibold">
              {(configMap.max_parallel_workers ?? 'unknown').replace(/"/g, '')}
            </p>
          </div>

          {/* Test gate */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Test Gate Mode
            </p>
            <p className="mt-2 text-lg font-semibold capitalize">
              {(configMap.test_gate_mode ?? 'unknown').replace(/"/g, '')}
            </p>
          </div>

          {/* Heartbeat */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Last Heartbeat
            </p>
            <p className="mt-2 font-mono text-sm">
              {configMap.last_heartbeat_at
                ? new Date(JSON.parse(configMap.last_heartbeat_at)).toLocaleString()
                : 'N/A'}
            </p>
          </div>

          {/* Read-access status */}
          <div className="col-span-full rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-700">
              ✓ Supabase read access verified — {config?.length ?? 0} config keys loaded
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
