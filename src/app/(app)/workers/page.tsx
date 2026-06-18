import { createServerClient } from '@/lib/supabase/server';
import { WorkersBoard } from './WorkersBoard';
import type { WorkerSession } from '@/components/WorkerCard';

export const dynamic = 'force-dynamic';

export default async function WorkersPage() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('worker_sessions')
    .select('id, session_number, title, status, worker_model, session_role, repo, dispatched_by, started_at, completed_at, duration_minutes, last_heartbeat, fidelity_score, fidelity_notes, error_message, failure_reason, work_item_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load worker sessions</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workers: WorkerSession[] = ((data as any[]) ?? []).map((row) => ({
    id: row.id,
    session_number: row.session_number ?? 0,
    title: row.title ?? '',
    status: row.status ?? 'queued',
    worker_model: row.worker_model ?? null,
    session_role: row.session_role ?? 'implementer',
    repo: row.repo ?? null,
    dispatched_by: row.dispatched_by ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    duration_minutes: row.duration_minutes ?? null,
    last_heartbeat: row.last_heartbeat ?? null,
    fidelity_score: row.fidelity_score ?? null,
    fidelity_notes: row.fidelity_notes ?? null,
    error_message: row.error_message ?? null,
    failure_reason: row.failure_reason ?? null,
    work_item_id: row.work_item_id ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
        Worker session monitoring
      </p>
      <WorkersBoard initialWorkers={workers} />
    </div>
  );
}
