import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { STATUS_LABELS, PRIORITY_CONFIG, REPO_CONFIG, timeAgo } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createServerClient();

  // Fetch item
  const { data: item, error } = await supabase
    .from('agentic_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (error || !item) notFound();

  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;

  // Fetch related data in parallel
  const [jobsRes, messagesRes, artifactsRes, revisionsRes, workersRes] = await Promise.all([
    supabase
      .from('agentic_jobs')
      .select('id, phase, status, round_number, dispatch_key, error_text, output_text, started_at, created_at, completed_at, metadata')
      .eq('item_id', itemId)
      .order('round_number', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('agentic_messages')
      .select('id, author, message_type, content, created_at')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true }),
    supabase
      .from('agentic_artifacts')
      .select('id, artifact_type, ref, metadata, created_at')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true }),
    supabase
      .from('agentic_design_revisions')
      .select('id, revision_number, status, scope_summary, created_at')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true }),
    supabase
      .from('worker_sessions')
      .select('id, session_number, title, status, worker_model, session_role, duration_minutes, fidelity_score, created_at')
      .eq('work_item_id', itemId)
      .order('created_at', { ascending: true }),
  ]);

  const jobs = jobsRes.data ?? [];
  const messages = messagesRes.data ?? [];
  const artifacts = artifactsRes.data ?? [];
  const revisions = revisionsRes.data ?? [];
  const workers = workersRes.data ?? [];

  const authorColors: Record<string, string> = {
    human: '#DBEAFE',
    codex: '#D1FAE5',
    claude_code: '#F3E8FF',
    system: 'var(--color-stone-100)',
    'agentic-conductor': '#FEF3C7',
    agentic_conductor: '#FEF3C7',
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-[var(--muted-foreground)]">
        <Link href="/pipeline" className="hover:text-[var(--foreground)]">
          Pipeline
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono font-medium text-[var(--foreground)]">{sid}</span>
      </div>

      {/* Header */}
      <div className="mb-6 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold">{sid}</span>
              <span
                className="inline-flex rounded-[6px] px-2 py-0.5 text-xs font-semibold"
                style={{ background: priority.bg, color: priority.text }}
              >
                {priority.label}
              </span>
              <span
                className="inline-flex rounded-[6px] px-2 py-0.5 text-xs font-medium"
                style={{ background: repo.bg, color: repo.text }}
              >
                {repo.label}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold">{item.title}</h1>
          </div>
          <span className="rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">
          <span>Created {timeAgo(item.created_at)}</span>
          <span>Updated {timeAgo(item.updated_at)}</span>
          <span>Round {item.current_round}</span>
          {item.escalated_at && (
            <span className="font-medium text-amber-600">
              Escalated: {item.escalation_reason}
            </span>
          )}
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-6">
        {/* Jobs timeline */}
        <Section title="Jobs" count={jobs.length}>
          {jobs.length === 0 ? (
            <EmptyState text="No jobs yet" />
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const durationMs = job.started_at && job.completed_at
                  ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
                  : null;
                return (
                  <div
                    key={job.id}
                    className="flex items-start gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
                  >
                    <StatusDot status={job.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.phase}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">R{job.round_number}</span>
                      </div>
                      {job.error_text && (
                        <p className="mt-1 line-clamp-2 text-xs text-red-600">{job.error_text}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {durationMs ? `${(durationMs / 1000).toFixed(1)}s` : timeAgo(job.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Design revisions */}
        <Section title="Design revisions" count={revisions.length}>
          {revisions.length === 0 ? (
            <EmptyState text="No design revisions" />
          ) : (
            <div className="space-y-2">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className={`rounded-[8px] border px-3 py-2.5 text-sm ${
                    rev.status === 'current'
                      ? 'border-[var(--primary)] bg-indigo-50 dark:bg-indigo-950'
                      : 'border-[var(--border)] bg-[var(--card)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Revision {rev.revision_number}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {rev.status} · {timeAgo(rev.created_at)}
                    </span>
                  </div>
                  {rev.scope_summary && (
                    <p className="mt-1 line-clamp-3 text-xs text-[var(--muted-foreground)]">
                      {rev.scope_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Messages */}
        <Section title="Messages" count={messages.length}>
          {messages.length === 0 ? (
            <EmptyState text="No messages" />
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: authorColors[msg.author] ?? 'var(--color-stone-100)',
                        color: 'var(--color-stone-800)',
                      }}
                    >
                      {msg.author}
                    </span>
                    <span className="text-[10px] uppercase text-[var(--muted-foreground)]">{msg.message_type}</span>
                    <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                      {timeAgo(msg.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">
                    {typeof msg.content === 'string'
                      ? msg.content.length > 500
                        ? msg.content.substring(0, 500) + '…'
                        : msg.content
                      : JSON.stringify(msg.content).substring(0, 500)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Artifacts */}
        <Section title="Artifacts" count={artifacts.length}>
          {artifacts.length === 0 ? (
            <EmptyState text="No artifacts" />
          ) : (
            <div className="space-y-2">
              {artifacts.map((art) => (
                <div
                  key={art.id}
                  className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{art.artifact_type}</span>
                  <span className="truncate text-xs text-[var(--muted-foreground)]">{art.ref}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                    {timeAgo(art.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Worker sessions */}
        <Section title="Worker sessions" count={workers.length}>
          {workers.length === 0 ? (
            <EmptyState text="No worker sessions" />
          ) : (
            <div className="space-y-2">
              {workers.map((w) => (
                <Link
                  key={w.id}
                  href={`/workers/${w.id}`}
                  className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--primary)]"
                >
                  <StatusDot status={w.status} />
                  <span className="font-mono text-xs font-medium">#{w.session_number}</span>
                  <span className="min-w-0 flex-1 truncate">{w.title}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{w.worker_model}</span>
                  {w.fidelity_score != null && (
                    <span className="text-xs font-medium text-emerald-600">{w.fidelity_score}%</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
      {text}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: '#3B82F6',
    running: '#10B981',
    complete: '#10B981',
    failed: '#EF4444',
    blocked: '#EF4444',
    cancelled: '#78716C',
    skipped: '#78716C',
    stalled: '#D97706',
  };
  const isRunning = status === 'running';
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {isRunning && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          style={{ background: colors[status] ?? '#78716C' }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ background: colors[status] ?? '#78716C' }}
      />
    </span>
  );
}
