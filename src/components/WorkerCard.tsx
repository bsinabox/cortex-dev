'use client';

import Link from 'next/link';
import {
  WORKER_STATUS_CONFIG,
  WORKER_MODEL_CONFIG,
  WORKER_ROLE_CONFIG,
  REPO_CONFIG,
  timeAgo,
  formatDuration,
  heartbeatStatus,
} from '@/lib/constants';

export type WorkerSession = {
  id: string;
  session_number: number;
  title: string;
  status: string;
  worker_model: string | null;
  session_role: string;
  repo: string | null;
  dispatched_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  last_heartbeat: string | null;
  fidelity_score: number | null;
  fidelity_notes: string | null;
  error_message: string | null;
  failure_reason: string | null;
  work_item_id: string | null;
  created_at: string;
};

interface WorkerCardProps {
  worker: WorkerSession;
}

export function WorkerCard({ worker }: WorkerCardProps) {
  const statusCfg = WORKER_STATUS_CONFIG[worker.status] ?? WORKER_STATUS_CONFIG.queued;
  const modelCfg = worker.worker_model
    ? WORKER_MODEL_CONFIG[worker.worker_model] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)', label: worker.worker_model }
    : null;
  const roleCfg = WORKER_ROLE_CONFIG[worker.session_role] ?? WORKER_ROLE_CONFIG.implementer;
  const repoCfg = worker.repo ? REPO_CONFIG[worker.repo] : null;
  const hbStatus = heartbeatStatus(worker.last_heartbeat);

  // Live elapsed time for running workers
  const elapsed = worker.status === 'running' && worker.started_at
    ? formatDuration(Math.floor((Date.now() - new Date(worker.started_at).getTime()) / 60000))
    : formatDuration(worker.duration_minutes);

  return (
    <Link
      href={`/workers/${worker.id}`}
      className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--primary)]"
    >
      {/* Header: session number + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-[var(--foreground)]">
          #{worker.session_number}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Heartbeat indicator for running workers */}
          {worker.status === 'running' && (
            <span
              className={`h-2 w-2 rounded-full ${
                hbStatus === 'healthy' ? 'bg-emerald-500 animate-pulse' :
                hbStatus === 'warning' ? 'bg-amber-500' :
                hbStatus === 'stale' ? 'bg-red-500' : 'bg-stone-400'
              }`}
              title={worker.last_heartbeat ? `Heartbeat: ${timeAgo(worker.last_heartbeat)}` : 'No heartbeat'}
            />
          )}
          <span
            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10px] font-bold"
            style={{ background: statusCfg.bg, color: statusCfg.text }}
          >
            {worker.status === 'running' && (
              <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: statusCfg.dot }} />
            )}
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className="mt-2 line-clamp-2 text-sm leading-snug text-[var(--foreground)]">
        {worker.title}
      </p>

      {/* Badges row: model + role + repo */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {modelCfg && (
          <span
            className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: modelCfg.bg, color: modelCfg.text }}
          >
            {modelCfg.label}
          </span>
        )}
        <span
          className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: roleCfg.bg, color: roleCfg.text }}
        >
          {roleCfg.label}
        </span>
        {repoCfg && (
          <span
            className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: repoCfg.bg, color: repoCfg.text }}
          >
            {repoCfg.label}
          </span>
        )}
      </div>

      {/* Footer: duration + dispatched by + fidelity */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <span>{elapsed}</span>
          {worker.dispatched_by && (
            <>
              <span>·</span>
              <span>{worker.dispatched_by}</span>
            </>
          )}
        </div>
        {worker.fidelity_score != null && (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, worker.fidelity_score)}%`,
                  background: worker.fidelity_score >= 80 ? '#10B981' :
                    worker.fidelity_score >= 50 ? '#F59E0B' : '#EF4444',
                }}
              />
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {worker.fidelity_score}
            </span>
          </div>
        )}
      </div>

      {/* Error summary for failed workers */}
      {worker.status === 'failed' && (worker.failure_reason || worker.error_message) && (
        <p className="mt-2 line-clamp-1 rounded-[6px] bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {worker.failure_reason ?? worker.error_message}
        </p>
      )}
    </Link>
  );
}
