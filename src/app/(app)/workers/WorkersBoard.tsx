'use client';

import { useState, useMemo } from 'react';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { WorkerCard, type WorkerSession } from '@/components/WorkerCard';

const ACTIVE_STATUSES = ['queued', 'running', 'stalled'];

interface WorkersBoardProps {
  initialWorkers: WorkerSession[];
}

export function WorkersBoard({ initialWorkers }: WorkersBoardProps) {
  const { data: workers } = useRealtimeTable<WorkerSession>(
    'worker_sessions',
    initialWorkers
  );

  const [showAll, setShowAll] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>('all');

  const filteredWorkers = useMemo(() => {
    return workers
      .filter((w) => {
        if (!showAll && !ACTIVE_STATUSES.includes(w.status)) return false;
        if (modelFilter !== 'all' && w.worker_model !== modelFilter) return false;
        return true;
      })
      .sort((a, b) => {
        // Active workers first, then by created_at descending
        const statusOrder = (s: string) => {
          if (s === 'running') return 0;
          if (s === 'queued') return 1;
          if (s === 'stalled') return 2;
          return 3;
        };
        const sDiff = statusOrder(a.status) - statusOrder(b.status);
        if (sDiff !== 0) return sDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [workers, showAll, modelFilter]);

  const activeCount = workers.filter((w) => ACTIVE_STATUSES.includes(w.status)).length;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`rounded-[8px] border px-3 py-1.5 text-sm transition-colors ${
            showAll
              ? 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]'
              : 'border-[var(--primary)] bg-[var(--primary)] text-white'
          }`}
        >
          Active only
        </button>

        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
        >
          <option value="all">All models</option>
          <option value="claude-code">Claude Code</option>
          <option value="codex">Codex</option>
        </select>

        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {activeCount} active · {filteredWorkers.length} showing
        </span>
      </div>

      {/* Workers grid */}
      {filteredWorkers.length === 0 ? (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            {showAll ? 'No worker sessions found' : 'No active workers — all quiet'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredWorkers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
