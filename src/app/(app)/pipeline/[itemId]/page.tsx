import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { STATUS_LABELS, PRIORITY_CONFIG, REPO_CONFIG, timeAgo } from '@/lib/constants';
import { CopyPromptButton } from '@/components/CopyPromptButton';
import { CollapsibleSection } from '@/components/CollapsibleSection';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage(props: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await props.params;
  const supabase = await createServerClient();

  const { data: rawItem, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, current_round, created_at, updated_at, escalated_at, escalation_reason, final_design_summary')
    .eq('id', itemId)
    .single();

  if (error || !rawItem) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = rawItem as any;

  const sid = (item.id as string).substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;

  const [jobsRes, messagesRes, artifactsRes, revisionsRes, workersRes] = await Promise.all([
    supabase.from('agentic_jobs').select('id, phase, status, round_number, error_text, started_at, created_at, completed_at')
      .eq('item_id', itemId).order('round_number', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('agentic_messages').select('id, author, message_type, content, created_at')
      .eq('item_id', itemId).order('created_at', { ascending: true }),
    supabase.from('agentic_artifacts').select('id, artifact_type, ref, created_at')
      .eq('item_id', itemId).order('created_at', { ascending: true }),
    supabase.from('agentic_design_revisions').select('id, revision_number, status, scope_summary, created_at')
      .eq('item_id', itemId).order('created_at', { ascending: true }),
    supabase.from('worker_sessions').select('id, session_number, title, status, worker_model, fidelity_score, created_at')
      .eq('work_item_id', itemId).order('created_at', { ascending: true }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs = (jobsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (messagesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifacts = (artifactsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revisions = (revisionsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workers = (workersRes.data ?? []) as any[];

  const hasData = jobs.length + messages.length + revisions.length + artifacts.length + workers.length > 0;

  const statusHint = item.status === 'awaiting_hub_design'
    ? '\n   - Begin Phase 1 design session per PHASE1_DESIGN_SESSION.md.'
    : item.status === 'testing_in_dev'
      ? '\n   - Summarize what to test and verification steps.'
      : '\n   - Recommend next action based on current status.';

  const bootPrompt = [
    'Boot up conductor item ' + sid + ' for work.',
    '',
    'Steps:',
    '1. Run mandatory timestamp.',
    '2. Query live state from Supabase (project ftpbxlizcsbzvmtbtuef):',
    '   - Item: SELECT * FROM agentic_items WHERE UPPER(LEFT(id::text, 8)) = \'' + sid + '\'',
    '   - Messages, revisions, jobs, workers for item_id = \'' + item.id + '\'',
    '3. Repo is ' + (item.repo ?? '') + ' — read relevant source from VPS.',
    '4. Report full context, then:' + statusHint,
    '',
    'Begin.',
  ].join('\n');

  const authorColors: Record<string, string> = {
    human: '#DBEAFE', codex: '#D1FAE5', claude_code: '#F3E8FF',
    system: '#F5F5F4', 'agentic-conductor': '#FEF3C7', agentic_conductor: '#FEF3C7',
  };

  const statusColors: Record<string, string> = {
    queued: '#3B82F6', running: '#10B981', complete: '#10B981', failed: '#EF4444',
    blocked: '#EF4444', cancelled: '#78716C', skipped: '#78716C', stalled: '#D97706',
  };

  function truncate(text: string, max: number) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '…';
  }

  return (
    <div>
      <div className="mb-4 text-sm text-[var(--muted-foreground)]">
        <Link href="/pipeline" className="hover:text-[var(--foreground)]">Pipeline</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono font-medium text-[var(--foreground)]">{sid}</span>
      </div>

      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold">{sid}</span>
              <span className="inline-flex rounded-[6px] px-2 py-0.5 text-xs font-semibold" style={{ background: priority.bg, color: priority.text }}>{priority.label}</span>
              <span className="inline-flex rounded-[6px] px-2 py-0.5 text-xs font-medium" style={{ background: repo.bg, color: repo.text }}>{repo.label}</span>
            </div>
            <h1 className="mt-2 text-base font-semibold sm:text-xl">{item.title}</h1>
          </div>
          <span className="rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-xs sm:text-sm font-medium shrink-0">{statusLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
          <span>Created {timeAgo(item.created_at)}</span>
          <span>Updated {timeAgo(item.updated_at)}</span>
          <span>Round {item.current_round}</span>
        </div>
      </div>

      <div className="mt-3">
        <CopyPromptButton prompt={bootPrompt} sid={sid} />
      </div>

      {!hasData && (
        <div className="mt-6 rounded-[10px] border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm font-medium">No pipeline activity yet</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Copy the boot prompt above and paste it into a new Hub conversation to start working on this item.
          </p>
        </div>
      )}

      {hasData && (
        <div className="mt-4 space-y-3">
          <CollapsibleSection title="Design revisions" count={revisions.length} defaultOpen={revisions.length > 0 && revisions.length <= 5}>
            {revisions.map((rev: any) => (
              <div key={rev.id} className={`mb-2 rounded-[8px] border px-3 py-2.5 text-sm ${rev.status === 'current' ? 'border-[var(--primary)] bg-indigo-50 dark:bg-indigo-950' : 'border-[var(--border)]'}`}>
                <div className="flex justify-between"><span className="font-medium">Rev {rev.revision_number}</span><span className="text-xs text-[var(--muted-foreground)]">{rev.status}</span></div>
                {rev.scope_summary && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{truncate(rev.scope_summary, 300)}</p>}
              </div>
            ))}
            {revisions.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Jobs" count={jobs.length} defaultOpen={jobs.length > 0 && jobs.length <= 8}>
            {jobs.map((job: any) => (
              <div key={job.id} className="mb-2 flex items-start gap-2 rounded-[8px] border border-[var(--border)] px-3 py-2 text-sm">
                <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusColors[job.status] ?? '#78716C' }} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{job.phase}</span>
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">R{job.round_number}</span>
                  {job.error_text && <p className="mt-0.5 text-xs text-red-500">{truncate(job.error_text, 200)}</p>}
                </div>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{timeAgo(job.created_at)}</span>
              </div>
            ))}
            {jobs.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Messages" count={messages.length} defaultOpen={messages.length > 0 && messages.length <= 5}>
            {messages.map((msg: any) => (
              <div key={msg.id} className="mb-2 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium" style={{ background: authorColors[msg.author] ?? '#F5F5F4', color: '#292524' }}>{msg.author}</span>
                  <span className="text-[10px] uppercase text-[var(--muted-foreground)]">{msg.message_type}</span>
                  <span className="ml-auto text-xs text-[var(--muted-foreground)]">{timeAgo(msg.created_at)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {truncate(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content), 500)}
                </p>
              </div>
            ))}
            {messages.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Artifacts" count={artifacts.length} defaultOpen={artifacts.length > 0}>
            {artifacts.map((art: any) => (
              <div key={art.id} className="mb-2 flex items-center gap-3 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm">
                <span className="font-medium">{art.artifact_type}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted-foreground)]">{art.ref}</span>
              </div>
            ))}
            {artifacts.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Workers" count={workers.length} defaultOpen={workers.length > 0 && workers.length <= 5}>
            {workers.map((w: any) => (
              <Link key={w.id} href={'/workers/' + w.id} className="mb-2 flex items-center gap-3 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm hover:border-[var(--primary)]">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusColors[w.status] ?? '#78716C' }} />
                <span className="font-mono text-xs">#{w.session_number}</span>
                <span className="min-w-0 flex-1 truncate">{w.title}</span>
                <span className="text-xs text-[var(--muted-foreground)]">{w.worker_model}</span>
              </Link>
            ))}
            {workers.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
