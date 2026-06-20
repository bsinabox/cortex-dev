'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type WorkerSession } from '@/components/WorkerCard';
import {
  WORKER_STATUS_CONFIG, WORKER_MODEL_CONFIG, REPO_CONFIG,
  timeAgo, formatDuration,
} from '@/lib/constants';

/* ─── Machine Visualization ─── */

interface WorkersBoardProps {
  initialWorkers: WorkerSession[];
}

export function WorkersBoard({ initialWorkers }: WorkersBoardProps) {
  const { data: workers } = useRealtimeTable<WorkerSession>(
    'worker_sessions',
    initialWorkers
  );

  const [timeWindow, setTimeWindow] = useState<'12h' | '24h' | '48h'>('48h');

  // Filter by time window
  const windowMs = timeWindow === '12h' ? 12 * 3600_000 : timeWindow === '24h' ? 24 * 3600_000 : 48 * 3600_000;
  const cutoff = Date.now() - windowMs;

  const windowWorkers = useMemo(() =>
    workers.filter(w => new Date(w.created_at).getTime() > cutoff),
    [workers, cutoff]
  );

  // Categorize
  const queued = windowWorkers.filter(w => w.status === 'queued');
  const processing = windowWorkers.filter(w => w.status === 'running' || w.status === 'stalled');
  const complete = windowWorkers.filter(w => w.status === 'complete');
  const failed = windowWorkers.filter(w => w.status === 'failed');
  const cancelled = windowWorkers.filter(w => w.status === 'cancelled');

  const totalFinished = complete.length + failed.length;
  const successRate = totalFinished > 0 ? Math.round((complete.length / totalFinished) * 100) : 100;

  // Avg duration for completed workers
  const durations = complete.filter(w => w.duration_minutes != null).map(w => w.duration_minutes!);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  return (
    <div>
      {/* Time window toggle */}
      <div className="mb-3 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold tracking-tight lg:text-2xl">Workers</h1>
        <div className="flex overflow-hidden rounded-[8px] border border-[var(--border)]">
          {(['12h', '24h', '48h'] as const).map(w => (
            <button key={w} onClick={() => setTimeWindow(w)}
              className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                timeWindow === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background)] text-[var(--muted-foreground)]'
              }`}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Stat boxes */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatBox label="Queued" count={queued.length} color="#3b82f6" icon="queue" />
        <StatBox label="Processing" count={processing.length} color="#10b981" icon="process" pulse={processing.length > 0} />
        <StatBox label="Complete" count={complete.length} color="#059669" icon="done" />
      </div>

      {/* Machine visualization */}
      <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--muted-foreground)]">Worker Machine</div>

        <div className="flex items-stretch gap-1">
          {/* Queue column */}
          <MachineColumn
            title="Queue"
            color="#3b82f6"
            items={queued}
            icon={
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#3b82f6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
          />

          {/* Arrow */}
          <FlowArrow active={queued.length > 0 || processing.length > 0} />

          {/* Processing column */}
          <MachineColumn
            title="Processing"
            color="#10b981"
            items={processing}
            pulse
            icon={
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#10b981">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
              </svg>
            }
          />

          {/* Arrow */}
          <FlowArrow active={processing.length > 0} />

          {/* Output column */}
          <MachineColumn
            title="Output"
            color="#059669"
            items={[...complete.slice(0, 5), ...failed.slice(0, 3)]}
            icon={
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#059669">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Footer stats */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--muted-foreground)]">Success rate:</span>
          <span className={`font-bold ${successRate >= 80 ? 'text-emerald-600' : successRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {successRate}%
          </span>
        </div>
        <span className="text-[var(--muted-foreground)]">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--muted-foreground)]">Avg duration:</span>
          <span className="font-semibold">{formatDuration(avgDuration)}</span>
        </div>
        <span className="text-[var(--muted-foreground)]">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--muted-foreground)]">Total:</span>
          <span className="font-semibold">{windowWorkers.length}</span>
        </div>
        {failed.length > 0 && (
          <>
            <span className="text-[var(--muted-foreground)]">·</span>
            <span className="font-semibold text-red-500">{failed.length} failed</span>
          </>
        )}
        {cancelled.length > 0 && (
          <>
            <span className="text-[var(--muted-foreground)]">·</span>
            <span className="text-[var(--muted-foreground)]">{cancelled.length} cancelled</span>
          </>
        )}
      </div>

      {/* Recent worker list */}
      <div className="px-1 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
        Recent Sessions ({Math.min(windowWorkers.length, 30)})
      </div>
      {windowWorkers.slice(0, 30).map(w => (
        <WorkerRow key={w.id} worker={w} />
      ))}

      {windowWorkers.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No worker sessions in the last {timeWindow}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Stat Box ─── */

function StatBox({ label, count, color, icon, pulse }: {
  label: string; count: number; color: string; icon: string; pulse?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {pulse && count > 0 && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: color }} />
        )}
        <span className="text-[24px] font-extrabold leading-none" style={{ color }}>{count}</span>
      </div>
      <div className="mt-1 text-[10px] font-semibold text-[var(--muted-foreground)]">{label}</div>
    </div>
  );
}

/* ─── Machine Column ─── */

function MachineColumn({ title, color, items, icon, pulse }: {
  title: string;
  color: string;
  items: WorkerSession[];
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col rounded-[8px] border border-[var(--border)] bg-[var(--background)] p-2">
      <div className="mb-1.5 flex items-center gap-1">
        {icon}
        <span className="text-[10px] font-bold" style={{ color }}>{title}</span>
        <span className="ml-auto text-[10px] font-bold text-[var(--muted-foreground)]">{items.length}</span>
      </div>
      <div className="flex min-h-[60px] flex-1 flex-col gap-1">
        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[9px] text-[var(--muted-foreground)] opacity-50">empty</span>
          </div>
        )}
        {items.slice(0, 6).map(w => (
          <WorkerDot key={w.id} worker={w} color={color} pulse={pulse && w.status === 'running'} />
        ))}
        {items.length > 6 && (
          <span className="text-center text-[9px] text-[var(--muted-foreground)]">+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

/* ─── Worker Dot (inside machine column) ─── */

function WorkerDot({ worker, color, pulse }: { worker: WorkerSession; color: string; pulse?: boolean }) {
  const sid = worker.id.substring(0, 6).toUpperCase();
  const failed = worker.status === 'failed';
  const dotColor = failed ? '#ef4444' : color;

  return (
    <Link
      href={`/workers/${worker.id}`}
      className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 transition-colors hover:bg-[var(--muted)]"
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{ background: dotColor }}
      />
      <span className="min-w-0 flex-1 truncate text-[9px]">{worker.title || `#${worker.session_number}`}</span>
    </Link>
  );
}

/* ─── Flow Arrow ─── */

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="flex w-6 shrink-0 items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 20 20" className={active ? 'animate-pulse' : 'opacity-20'}>
        <path d="M4 10 L12 10" stroke={active ? 'var(--primary)' : 'var(--muted-foreground)'} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10 7 L14 10 L10 13" stroke={active ? 'var(--primary)' : 'var(--muted-foreground)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* ─── Worker Row (list below machine) ─── */

function WorkerRow({ worker }: { worker: WorkerSession }) {
  const statusCfg = WORKER_STATUS_CONFIG[worker.status] ?? WORKER_STATUS_CONFIG.queued;
  const modelCfg = worker.worker_model
    ? WORKER_MODEL_CONFIG[worker.worker_model] ?? null
    : null;
  const repoCfg = worker.repo ? REPO_CONFIG[worker.repo] : null;

  const elapsed = worker.status === 'running' && worker.started_at
    ? formatDuration(Math.floor((Date.now() - new Date(worker.started_at).getTime()) / 60000))
    : formatDuration(worker.duration_minutes);

  return (
    <Link
      href={`/workers/${worker.id}`}
      className={`mb-0.5 flex items-center gap-1.5 rounded-[8px] border px-2.5 py-2 transition-colors active:border-[var(--primary)] ${
        worker.status === 'failed'
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
          : worker.status === 'running'
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
            : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      {/* Status dot */}
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${worker.status === 'running' ? 'animate-pulse' : ''}`}
        style={{ background: statusCfg.dot }}
      />

      {/* Session number */}
      <span className="font-mono text-[11px] font-bold text-[var(--muted-foreground)]">#{worker.session_number}</span>

      {/* Status pill */}
      <span
        className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold"
        style={{ background: statusCfg.bg, color: statusCfg.text }}
      >
        {statusCfg.label}
      </span>

      {/* Model pill */}
      {modelCfg && (
        <span
          className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold"
          style={{ background: modelCfg.bg, color: modelCfg.text }}
        >
          {modelCfg.label}
        </span>
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-[11px]">{worker.title}</span>

      {/* Duration */}
      <span className="shrink-0 text-[9px] text-[var(--muted-foreground)]">{elapsed}</span>

      {/* Repo pill */}
      {repoCfg && (
        <span
          className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold"
          style={{ background: repoCfg.bg, color: repoCfg.text }}
        >
          {repoCfg.label}
        </span>
      )}

      {/* Time ago */}
      <span className="shrink-0 text-[9px] text-[var(--muted-foreground)]">{timeAgo(worker.created_at)}</span>
    </Link>
  );
}
