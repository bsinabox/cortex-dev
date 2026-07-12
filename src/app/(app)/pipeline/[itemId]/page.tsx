import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import {
  STATUS_LABELS, PRIORITY_CONFIG, REPO_CONFIG, timeAgo,
  PIPELINE_PHASES, getPhaseIndex, getPhasesForPolicy,
  QUEUE_STATUSES, BLOCKED_STATUSES, DONE_STATUSES,
} from '@/lib/constants';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { MessageCard } from '@/components/MessageCard';
import { KertecTestLinks } from '@/components/KertecTestLinks';
import { ItemDetailActions } from './ItemDetailActions';

export const dynamic = 'force-dynamic';

/* ── scope_summary jsonb → readable pills ───────────────────────── */

type ScopeField = { label: string; value: string };

const SCOPE_KEYS: Record<string, string> = {
  risk: 'Risk', type: 'Type', complexity: 'Complexity',
  surfaces: 'Surfaces', routes: 'Routes', tables: 'Tables',
  components: 'Components', apis: 'APIs', tests: 'Tests',
  scope_refs: 'Refs', files_changed: 'Files',
};

function parseScopeSummary(raw: unknown): ScopeField[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const fields: ScopeField[] = [];
  for (const [key, label] of Object.entries(SCOPE_KEYS)) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      if (val.length <= 3 && val.every((v: unknown) => typeof v === 'string' && v.length < 30)) {
        fields.push({ label, value: val.join(', ') });
      } else {
        fields.push({ label, value: `${val.length}` });
      }
    } else if (typeof val === 'string') {
      fields.push({ label, value: val });
    }
  }
  return fields;
}

/* ── page ────────────────────────────────────────────────────────── */

export default async function ItemDetailPage(props: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await props.params;
  const supabase = await createServerClient();

  const { data: rawItem, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, current_round, execution_policy, created_at, updated_at, escalated_at, escalation_reason, escalation_evidence_id, final_design_summary, ticket_ref')
    .eq('id', itemId)
    .single();

  if (error || !rawItem) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = rawItem as any;

  const sid = (item.id as string).substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;

  // Canonical KerTec ticket (linked via agentic_items.ticket_ref → tickets.ref).
  const ticketRef: string | null = item.ticket_ref ?? null;
  let ticket: { ref: string; subject: string | null; capability: string | null; priority: string | null; client_status: string | null } | null = null;
  if (ticketRef) {
    const { data: ticketData } = await supabase
      .from('tickets')
      .select('ref, subject, capability, priority, client_status')
      .eq('ref', ticketRef)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ticket = (ticketData as any) ?? null;
  }

  // Determine pipeline phase state for chevron
  const phases = getPhasesForPolicy(item.execution_policy);
  const currentPhaseIdx = getPhaseIndex(item.status);
  const isDone = DONE_STATUSES.includes(item.status);
  const isQueue = QUEUE_STATUSES.includes(item.status);
  const isBlocked = BLOCKED_STATUSES.includes(item.status);

  // Action-needed check
  const actionStatuses = new Set(['human_review', 'testing_in_dev', 'design_review_hold', 'promotion_review', 'awaiting_prod_promotion']);
  const needsAction = actionStatuses.has(item.status);

  // Fetch related data
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
  const jobs = ((jobsRes.data ?? []) as any[]).map((j: any) => ({
    ...j,
    error_text: typeof j.error_text === 'string' && j.error_text.length > 300
      ? j.error_text.substring(0, 300) + '\u2026'
      : j.error_text ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = ((messagesRes.data ?? []) as any[]).map((m: any) => ({
    ...m,
    content: typeof m.content === 'string' && m.content.length > 2000
      ? m.content.substring(0, 2000) + '\u2026'
      : m.content ?? '',
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifacts = (artifactsRes.data ?? []) as any[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revisions = ((revisionsRes.data ?? []) as any[]).map((r: any) => ({
    ...r,
    scopeFields: parseScopeSummary(r.scope_summary),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workers = (workersRes.data ?? []) as any[];

  const hasData = jobs.length + messages.length + revisions.length + artifacts.length + workers.length > 0;

  // Smart boot prompt
  const statusHint = item.status === 'awaiting_hub_design'
    ? '\n   - Begin Phase 1 design session per PHASE1_DESIGN_SESSION.md.'
    : item.status === 'testing_in_dev'
      ? '\n   - Summarize what to test and verification steps.'
      : item.status === 'design_review_hold'
        ? '\n   - Review QA escalation findings and determine corrections.'
        : '\n   - Recommend next action based on current status.';

  const bootPrompt = [
    'Boot up conductor item ' + sid + ' for work.',
    '',
    'Steps:',
    '1. Run mandatory timestamp.',
    '2. Query live state from Supabase (project ftpbxlizcsbzvmtbtuef):',
    '   - Item: SELECT * FROM agentic_items WHERE UPPER(LEFT(id::text, 8)) = \'' + sid + '\'',
    '   - Jobs: SELECT * FROM agentic_jobs WHERE item_id = \'' + item.id + '\' ORDER BY round_number, created_at',
    '   - Messages: SELECT * FROM agentic_messages WHERE item_id = \'' + item.id + '\' ORDER BY created_at',
    '   - Revisions: SELECT * FROM agentic_design_revisions WHERE item_id = \'' + item.id + '\' ORDER BY created_at',
    '   - Workers: SELECT * FROM worker_sessions WHERE work_item_id = \'' + item.id + '\' ORDER BY created_at',
    '3. Repo is ' + (item.repo ?? '') + ' \u2014 read relevant source from VPS.',
    '4. Report full context, then:' + statusHint,
    '',
    'Begin.',
  ].join('\n');

  // Action description for the action card
  const actionDescription = getActionDescription(item.status, item.escalation_reason);

  const statusDot: Record<string, string> = {
    queued: '#3B82F6', running: '#10B981', complete: '#10B981', failed: '#EF4444',
    blocked: '#EF4444', cancelled: '#78716C', skipped: '#78716C', stalled: '#D97706',
  };

  const jobStatusLabel: Record<string, string> = {
    queued: 'Queued', running: 'Running', complete: 'Complete', failed: 'Failed',
    blocked: 'Blocked', cancelled: 'Cancelled', skipped: 'Skipped', stalled: 'Stalled',
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-3 text-sm text-[var(--muted-foreground)]">
        <Link href="/pipeline" className="hover:text-[var(--foreground)]">Pipeline</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono font-medium text-[var(--foreground)]">{sid}</span>
      </div>

      {/* ── Header card ── */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xl font-bold">{sid}</span>
          <span className="rounded-[6px] px-2 py-0.5 text-xs font-semibold" style={{ background: priority.bg, color: priority.text }}>{priority.label}</span>
          <span className="rounded-[6px] px-2 py-0.5 text-xs font-medium" style={{ background: repo.bg, color: repo.text }}>{repo.label}</span>
          {item.execution_policy === 'launched_dev_to_uat_to_prod' && (
            <span className="rounded-[6px] bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900 dark:text-pink-300">
              &#128274; UAT
            </span>
          )}
          <span className="ml-auto rounded-[8px] border border-[var(--border)] px-2.5 py-1 text-xs font-medium">{statusLabel}</span>
        </div>
        <h1 className="mt-2 text-base font-semibold sm:text-lg">{item.title}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
          <span>Created {timeAgo(item.created_at)}</span>
          <span>Updated {timeAgo(item.updated_at)}</span>
          <span>Round {item.current_round}</span>
        </div>
      </div>

      {/* ── KerTec ticket ── */}
      {ticketRef ? (
        <Link
          href={`/tickets/${ticketRef}`}
          className="mt-3 block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--primary)] sm:p-4"
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">KerTec Ticket</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-[6px] bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {ticket?.ref ?? ticketRef}
            </span>
            {ticket?.subject && (
              <span className="min-w-0 text-sm font-medium">{ticket.subject}</span>
            )}
          </div>
          {(ticket?.capability || ticket?.client_status) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ticket?.capability && (
                <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  <span className="font-medium">Capability</span>
                  <span>{ticket.capability}</span>
                </span>
              )}
              {ticket?.client_status && (
                <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  <span className="font-medium">Client status</span>
                  <span>{ticket.client_status}</span>
                </span>
              )}
              {ticket?.priority && (
                <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  <span className="font-medium">Priority</span>
                  <span>{ticket.priority}</span>
                </span>
              )}
            </div>
          )}
          {!ticket && (
            <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">Ticket {ticketRef} not found.</p>
          )}
        </Link>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 px-1 text-[11px] text-[var(--muted-foreground)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)] opacity-40" />
          No linked ticket
        </div>
      )}

      {/* ── Chevron progress bar ── */}
      <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-0">
          {phases.map((phase, idx) => {
            // Map phase key to index in PIPELINE_PHASES for comparison
            const phaseGlobalIdx = PIPELINE_PHASES.findIndex(p => p.key === phase.key);
            let state: 'completed' | 'current' | 'future' = 'future';

            if (isDone) {
              state = 'completed';
            } else if (isQueue || isBlocked) {
              state = 'future';
            } else if (phaseGlobalIdx < currentPhaseIdx) {
              state = 'completed';
            } else if (phaseGlobalIdx === currentPhaseIdx) {
              state = 'current';
            }

            const isFirst = idx === 0;
            const isLast = idx === phases.length - 1;

            return (
              <div key={phase.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                {/* Chevron bar segment */}
                <div className="flex w-full items-center">
                  {!isFirst && (
                    <div className="h-[3px] flex-1" style={{
                      background: state === 'future' ? 'var(--border)' : phase.dot,
                      opacity: state === 'future' ? 1 : 0.8,
                    }} />
                  )}
                  <div
                    className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      state === 'current' ? 'animate-pulse' : ''
                    }`}
                    style={{
                      background: state === 'future' ? 'var(--muted)' : state === 'current' ? phase.bg : phase.dot,
                      color: state === 'future' ? 'var(--muted-foreground)' : state === 'current' ? phase.text : 'white',
                      outline: state === 'current' ? `2px solid ${phase.dot}` : undefined,
                      outlineOffset: state === 'current' ? '2px' : undefined,
                    }}
                  >
                    {state === 'completed' ? '\u2713' : (idx + 1)}
                  </div>
                  {!isLast && (
                    <div className="h-[3px] flex-1" style={{
                      background: state === 'future' || (state === 'current') ? 'var(--border)' : phases[idx + 1] ? PIPELINE_PHASES.find(p => p.key === phases[idx + 1].key)?.dot ?? 'var(--border)' : 'var(--border)',
                      opacity: state === 'completed' ? 0.8 : 1,
                    }} />
                  )}
                </div>
                {/* Phase label */}
                <span className={`text-[9px] font-medium leading-none ${
                  state === 'current' ? 'font-bold' : state === 'completed' ? '' : 'text-[var(--muted-foreground)]'
                }`}
                  style={{ color: state === 'current' ? phase.text : state === 'completed' ? phase.dot : undefined }}
                >
                  {state === 'completed' ? '\u2713 ' : state === 'current' ? '\u25B6 ' : ''}{phase.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Extra status for non-pipeline states */}
        {isQueue && (
          <p className="mt-2 text-center text-[10px] text-[var(--muted-foreground)]">
            In queue \u2014 waiting for design session to enter pipeline
          </p>
        )}
        {isBlocked && (
          <p className="mt-2 text-center text-[10px] text-red-500">
            Blocked \u2014 {item.status === 'readiness_blocked' ? 'prerequisites missing' : 'needs manual intervention'}
          </p>
        )}
        {isDone && (
          <p className="mt-2 text-center text-[10px] text-emerald-600">
            \u2713 All phases complete \u2014 deployed and verified
          </p>
        )}
      </div>

      {/* ── Action card (if action needed) ── */}
      {needsAction && (
        <div className="mt-3 rounded-[10px] border-2 border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30 sm:p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-lg">&#9888;&#65039;</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Action needed</p>
              <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">{actionDescription}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Action buttons (client component) ── */}
      <div className="mt-3">
        <ItemDetailActions
          itemId={item.id}
          sid={sid}
          status={item.status}
          bootPrompt={bootPrompt}
          needsAction={needsAction}
        />
      </div>

      {/* ── Test in KerTec (KerTec items only) ── */}
      {item.repo === 'kertec-field-app-v2' && (
        <div className="mt-3">
          <KertecTestLinks
            repo={item.repo}
            status={item.status}
            finalDesignSummary={typeof item.final_design_summary === 'string' ? item.final_design_summary : null}
          />
        </div>
      )}

      {/* ── History sections ── */}
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

          {/* ── Design summary (if available) ── */}
          {item.final_design_summary && (
            <CollapsibleSection title="Design summary" count={1} defaultOpen>
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {typeof item.final_design_summary === 'string'
                  ? item.final_design_summary.length > 1500
                    ? item.final_design_summary.substring(0, 1500) + '\u2026'
                    : item.final_design_summary
                  : JSON.stringify(item.final_design_summary, null, 2)}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Design Revisions ── */}
          <CollapsibleSection title="Design revisions" count={revisions.length} defaultOpen={revisions.length > 0 && revisions.length <= 5}>
            {revisions.map((rev: { id: string; revision_number: number; status: string; scopeFields: ScopeField[]; created_at: string }) => (
              <div key={rev.id} className={`mb-2 rounded-[8px] border px-3 py-2.5 text-sm ${rev.status === 'current' ? 'border-[var(--primary)] bg-indigo-50 dark:bg-indigo-950' : 'border-[var(--border)]'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Rev {rev.revision_number}</span>
                    <span className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium ${
                      rev.status === 'current'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}>
                      {rev.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)]">{timeAgo(rev.created_at)}</span>
                </div>
                {rev.scopeFields.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rev.scopeFields.map((f) => (
                      <span key={f.label} className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                        <span className="font-medium">{f.label}</span>
                        <span>{f.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {revisions.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          {/* ── Jobs ── */}
          <CollapsibleSection title="Jobs" count={jobs.length} defaultOpen={jobs.length > 0 && jobs.length <= 8}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {jobs.map((job: any) => (
              <div key={job.id} className="mb-2 flex items-start gap-2 rounded-[8px] border border-[var(--border)] px-3 py-2 text-sm">
                <span className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusDot[job.status] ?? '#78716C' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.phase}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      R{job.round_number} &middot; {jobStatusLabel[job.status] ?? job.status}
                    </span>
                  </div>
                  {job.error_text && (
                    <p className="mt-0.5 rounded-[4px] bg-red-50 dark:bg-red-950 px-1.5 py-1 text-[10px] text-red-600 dark:text-red-400 leading-relaxed">
                      {job.error_text}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{timeAgo(job.created_at)}</span>
              </div>
            ))}
            {jobs.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          {/* ── Messages ── */}
          <CollapsibleSection title="Messages" count={messages.length} defaultOpen={messages.length > 0 && messages.length <= 5}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {messages.map((msg: any) => (
              <MessageCard
                key={msg.id}
                author={msg.author}
                messageType={msg.message_type}
                content={typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                createdAt={msg.created_at}
              />
            ))}
            {messages.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          {/* ── Artifacts ── */}
          <CollapsibleSection title="Artifacts" count={artifacts.length} defaultOpen={artifacts.length > 0}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {artifacts.map((art: any) => (
              <div key={art.id} className="mb-2 flex items-center gap-3 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm">
                <span className="font-medium">{art.artifact_type}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted-foreground)]">{art.ref}</span>
              </div>
            ))}
            {artifacts.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">None</p>}
          </CollapsibleSection>

          {/* ── Workers ── */}
          <CollapsibleSection title="Workers" count={workers.length} defaultOpen={workers.length > 0 && workers.length <= 5}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {workers.map((w: any) => (
              <Link key={w.id} href={'/workers/' + w.id} className="mb-2 flex items-center gap-3 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm hover:border-[var(--primary)]">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusDot[w.status] ?? '#78716C' }} />
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

/* ── Action description helper ── */

function getActionDescription(status: string, escalationReason: string | null): string {
  switch (status) {
    case 'human_review':
      return 'Design is ready for approval. Review the design summary and revision history, then ship it or request changes.';
    case 'testing_in_dev':
      return 'Build deployed to dev. Open the app, verify the changes work as specified, then sign off to promote.';
    case 'design_review_hold':
      return escalationReason
        ? `QA escalated: ${escalationReason}. Review the findings and determine corrections.`
        : 'QA found issues during review. Check the escalation findings and provide corrections.';
    case 'promotion_review':
      return 'Verified on dev and ready for production. Approve the promotion to deploy to prod.';
    default:
      return '';
  }
}
