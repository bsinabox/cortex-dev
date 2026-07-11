'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { TICKET_PRIORITY_CONFIG, COVERAGE_STATUS_CONFIG } from '@/lib/constants';

export type CoverageStatus = 'uncovered' | 'in_progress' | 'resolved';

export type CoverageRow = {
  ref: string;
  subject: string;
  scope: string;
  client_status: string | null;
  build_state: string | null;
  priority: string | null;
  capability: string | null;
  work_item_ids: string[];
  n_items: number;
  coverage_status: CoverageStatus;
};

export type WorkItemRef = {
  id: string;
  title: string;
  status: string | null;
};

type Scope = 'bs' | 'kertec_business' | 'all';

const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: 'bs', label: 'BS' },
  { key: 'kertec_business', label: 'KerTec-business' },
  { key: 'all', label: 'All' },
];

// Uncovered first — it is the gap ("what's still missing").
const SECTION_ORDER: CoverageStatus[] = ['uncovered', 'in_progress', 'resolved'];

const NEEDS_TRIAGE = 'Needs triage';

interface TicketsBoardProps {
  rows: CoverageRow[];
  workItems: Record<string, WorkItemRef>;
}

export function TicketsBoard({ rows, workItems }: TicketsBoardProps) {
  const [scope, setScope] = useState<Scope>('bs');

  // Header "nothing is missing" number is always the in-scope (BS) coverage,
  // independent of the section scope filter.
  const bsStats = useMemo(() => {
    const bs = rows.filter((r) => r.scope === 'bs');
    const covered = bs.filter((r) => r.coverage_status !== 'uncovered').length;
    const uncovered = bs.length - covered;
    return { total: bs.length, covered, uncovered };
  }, [rows]);

  const pct = bsStats.total > 0 ? Math.round((bsStats.covered / bsStats.total) * 100) : 0;

  const visible = useMemo(
    () => (scope === 'all' ? rows : rows.filter((r) => r.scope === scope)),
    [rows, scope],
  );

  const bySection = useMemo(() => {
    const map: Record<CoverageStatus, CoverageRow[]> = {
      uncovered: [],
      in_progress: [],
      resolved: [],
    };
    for (const r of visible) map[r.coverage_status].push(r);
    return map;
  }, [visible]);

  // Suggested groups: bucket the uncovered set by capability so related gaps can
  // be turned into a single work item. Null capability → "Needs triage".
  const uncoveredGroups = useMemo(() => {
    const groups = new Map<string, CoverageRow[]>();
    for (const r of bySection.uncovered) {
      const key = r.capability ?? NEEDS_TRIAGE;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      // Largest gaps first; keep "Needs triage" pinned to the bottom.
      .sort((a, b) => {
        if (a[0] === NEEDS_TRIAGE) return 1;
        if (b[0] === NEEDS_TRIAGE) return -1;
        return b[1].length - a[1].length;
      });
  }, [bySection.uncovered]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Single source of truth over client tickets — coverage across the work board.
          </p>
        </div>
      </div>

      {/* Coverage summary + progress bar (BS = in-scope) */}
      <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {bsStats.covered} of {bsStats.total} in-scope tickets covered
            <span className="text-[var(--muted-foreground)]"> &middot; {bsStats.uncovered} uncovered</span>
          </p>
          <span className="text-sm font-semibold text-[var(--foreground)]">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Covered = referenced by at least one in-progress or resolved work item. This is the
          &ldquo;nothing is missing&rdquo; number.
        </p>
      </div>

      {/* Scope filter */}
      <div className="mt-4 inline-flex rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-0.5">
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScope(tab.key)}
            className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
              scope === tab.key
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sections — uncovered first */}
      <div className="mt-4 space-y-6">
        {SECTION_ORDER.map((status) => {
          const sectionRows = bySection[status];
          const cfg = COVERAGE_STATUS_CONFIG[status];
          return (
            <section key={status}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: cfg.dot }} />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">{cfg.label}</h2>
                <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                  {sectionRows.length}
                </span>
              </div>

              {sectionRows.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
                  No {cfg.label.toLowerCase()} tickets in this scope.
                </p>
              ) : status === 'uncovered' ? (
                // Uncovered → capability-grouped "Suggested group" blocks.
                <div className="space-y-2">
                  {uncoveredGroups.map(([capability, groupRows], i) => (
                    <CollapsibleSection
                      key={capability}
                      title={`Suggested group · ${capability}`}
                      count={groupRows.length}
                      defaultOpen={i === 0}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {/* TODO(tickets-ssot): wire "accept" to create a work_board_item
                            referencing every ticket ref in this capability group. Left
                            non-functional in this read-only PR. */}
                        <button
                          type="button"
                          disabled
                          title="Coming soon — will create a work item covering this group"
                          className="cursor-not-allowed rounded-[6px] border border-dashed border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)] opacity-70"
                        >
                          + Accept &amp; create work item
                        </button>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {groupRows.length} uncovered ticket{groupRows.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {groupRows.map((r) => (
                          <TicketRow key={r.ref} row={r} workItems={workItems} />
                        ))}
                      </div>
                    </CollapsibleSection>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {sectionRows.map((r) => (
                    <TicketRow key={r.ref} row={r} workItems={workItems} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TicketRow({ row, workItems }: { row: CoverageRow; workItems: Record<string, WorkItemRef> }) {
  const priority = row.priority ? TICKET_PRIORITY_CONFIG[row.priority] : undefined;
  const cov = COVERAGE_STATUS_CONFIG[row.coverage_status];
  const covered = row.coverage_status !== 'uncovered';

  return (
    <Link
      href={`/tickets/${row.ref}`}
      className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--primary)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{row.ref}</span>
            {priority && (
              <span
                className="inline-flex rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: priority.bg, color: priority.text }}
              >
                {priority.label}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: cov.bg, color: cov.text }}
            >
              {cov.label}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-[var(--foreground)]">{row.subject}</p>
          {row.capability && (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.capability}</p>
          )}
        </div>
      </div>

      {/* Covered → the work_board_item(s) referencing this ticket. No work-board
          detail route exists yet, so these are non-linking chips (title + short id). */}
      {covered && row.work_item_ids.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Work {row.work_item_ids.length === 1 ? 'item' : 'items'}
          </span>
          {row.work_item_ids.map((id) => {
            const wi = workItems[id];
            const short = id.substring(0, 8);
            return (
              <span
                key={id}
                title={wi?.title || id}
                className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--foreground)]"
              >
                <span className="font-mono text-[var(--muted-foreground)]">{short}</span>
                {wi?.title && <span className="truncate">{wi.title}</span>}
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
}
