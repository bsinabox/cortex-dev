import { createServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
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

export const dynamic = 'force-dynamic';

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('worker_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker = data as any;

  const statusCfg = WORKER_STATUS_CONFIG[worker.status] ?? WORKER_STATUS_CONFIG.queued;
  const modelCfg = worker.worker_model
    ? WORKER_MODEL_CONFIG[worker.worker_model] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)', label: worker.worker_model }
    : null;
  const roleCfg = WORKER_ROLE_CONFIG[worker.session_role] ?? WORKER_ROLE_CONFIG.implementer;
  const repoCfg = worker.repo ? REPO_CONFIG[worker.repo] : null;
  const hbStatus = heartbeatStatus(worker.last_heartbeat);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back nav */}
      <Link
        href="/workers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Workers
      </Link>

      {/* Header */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl font-bold">#{worker.session_number}</h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-xs font-bold"
                style={{ background: statusCfg.bg, color: statusCfg.text }}
              >
                {worker.status === 'running' && (
                  <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: statusCfg.dot }} />
                )}
                {statusCfg.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">{worker.title}</p>
          </div>

          {/* Heartbeat */}
          {worker.status === 'running' && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  hbStatus === 'healthy' ? 'bg-emerald-500 animate-pulse' :
                  hbStatus === 'warning' ? 'bg-amber-500' :
                  hbStatus === 'stale' ? 'bg-red-500' : 'bg-stone-400'
                }`}
              />
              <span className="text-[var(--muted-foreground)]">
                {worker.last_heartbeat ? timeAgo(worker.last_heartbeat) : 'No heartbeat'}
              </span>
            </div>
          )}
        </div>

        {/* Metadata grid */}
        <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem label="Model">
            {modelCfg ? (
              <span className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium" style={{ background: modelCfg.bg, color: modelCfg.text }}>
                {modelCfg.label}
              </span>
            ) : <span className="text-[var(--muted-foreground)]">—</span>}
          </MetaItem>
          <MetaItem label="Role">
            <span className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium" style={{ background: roleCfg.bg, color: roleCfg.text }}>
              {roleCfg.label}
            </span>
          </MetaItem>
          <MetaItem label="Repo">
            {repoCfg ? (
              <span className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium" style={{ background: repoCfg.bg, color: repoCfg.text }}>
                {repoCfg.label}
              </span>
            ) : <span className="text-[var(--muted-foreground)]">—</span>}
          </MetaItem>
          <MetaItem label="Duration">{formatDuration(worker.duration_minutes)}</MetaItem>
          <MetaItem label="Dispatched by">{worker.dispatched_by ?? '—'}</MetaItem>
          <MetaItem label="Dispatch key">
            <span className="font-mono text-xs">{worker.dispatch_key}</span>
          </MetaItem>
          <MetaItem label="Started">{worker.started_at ? timeAgo(worker.started_at) : '—'}</MetaItem>
          <MetaItem label="Completed">{worker.completed_at ? timeAgo(worker.completed_at) : '—'}</MetaItem>
        </div>

        {/* Fidelity score */}
        {worker.fidelity_score != null && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Fidelity</p>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, worker.fidelity_score)}%`,
                    background: worker.fidelity_score >= 80 ? '#10B981' :
                      worker.fidelity_score >= 50 ? '#F59E0B' : '#EF4444',
                  }}
                />
              </div>
              <span className="text-sm font-semibold">{worker.fidelity_score}%</span>
            </div>
            {worker.fidelity_notes && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{worker.fidelity_notes}</p>
            )}
          </div>
        )}

        {/* Error message */}
        {worker.status === 'failed' && (worker.failure_reason || worker.error_message) && (
          <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-800">Error</p>
            <p className="mt-1 text-sm text-red-700">{worker.failure_reason ?? worker.error_message}</p>
          </div>
        )}

        {/* Linked item */}
        {worker.work_item_id && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Linked Item</p>
            <Link
              href={`/pipeline/${worker.work_item_id}`}
              className="inline-flex items-center gap-1 font-mono text-sm text-[var(--primary)] hover:underline"
            >
              {worker.work_item_id.substring(0, 8).toUpperCase()}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Prompt section */}
      <CollapsibleSection title="Prompt" defaultOpen={false} size={worker.prompt_size}>
        <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--foreground)]">
          {worker.prompt}
        </pre>
      </CollapsibleSection>

      {/* Checkpoint section */}
      {worker.checkpoint && (
        <CollapsibleSection title="Checkpoint" defaultOpen={true} timestamp={worker.checkpoint_at} size={worker.checkpoint_size}>
          <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--foreground)]">
            {worker.checkpoint}
          </pre>
        </CollapsibleSection>
      )}

      {/* Progress snapshot */}
      {worker.progress_snapshot && Object.keys(worker.progress_snapshot).length > 0 && (
        <CollapsibleSection title="Progress Snapshot" defaultOpen={true}>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--foreground)]">
            {JSON.stringify(worker.progress_snapshot, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Context */}
      {worker.context && Object.keys(worker.context).length > 0 && (
        <CollapsibleSection title="Context" defaultOpen={false}>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--foreground)]">
            {JSON.stringify(worker.context, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Auto-launch log */}
      {worker.auto_launch_log && (
        <CollapsibleSection title="Auto-launch Log" defaultOpen={false}>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--muted-foreground)]">
            {worker.auto_launch_log}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  timestamp,
  size,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  timestamp?: string | null;
  size?: number | null;
  children: React.ReactNode;
}) {
  return (
    <details className="group mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--card)]" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-sm font-medium select-none">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {title}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          {size != null && <span>{(size / 1024).toFixed(1)}KB</span>}
          {timestamp && <span>{timeAgo(timestamp)}</span>}
        </div>
      </summary>
      <div className="border-t border-[var(--border)] p-4">
        {children}
      </div>
    </details>
  );
}
