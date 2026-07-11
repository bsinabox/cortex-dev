import { createServerClient } from '@/lib/supabase/server';
import { TicketsBoard, type CoverageRow, type WorkItemRef } from './TicketsBoard';

export const dynamic = 'force-dynamic';

/**
 * Tickets — single source of truth over client tickets.
 *
 * Reads the canonical `tickets` registry via the derived `ticket_coverage`
 * view: each row is a ticket plus its coverage_status (uncovered | in_progress
 * | resolved) derived from the work_board_items that REFERENCE it (via
 * work_board_items.tickets[] → ticket_coverage.work_item_ids). Tickets are
 * referenced, never duplicated, by work items.
 *
 * Read-only view: no writes happen here. The "accept → create work item" flow
 * for uncovered tickets is stubbed in TicketsBoard for a later PR.
 */
export default async function TicketsPage() {
  const supabase = await createServerClient();

  const { data: rawRows, error: covErr } = await supabase
    .from('ticket_coverage')
    .select('ref, subject, scope, client_status, build_state, priority, capability, work_item_ids, n_items, coverage_status')
    .order('ref', { ascending: true });

  if (covErr) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <div className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load ticket coverage</p>
          <p className="mt-1 font-mono text-xs">{covErr.message}</p>
        </div>
      </div>
    );
  }

  const rows: CoverageRow[] = (rawRows ?? []).map((r) => ({
    ref: r.ref,
    subject: r.subject ?? '',
    scope: r.scope ?? 'bs',
    client_status: r.client_status ?? null,
    build_state: r.build_state ?? null,
    priority: r.priority ?? null,
    capability: r.capability ?? null,
    work_item_ids: (r.work_item_ids ?? []) as string[],
    n_items: Number(r.n_items ?? 0),
    coverage_status: (r.coverage_status ?? 'uncovered') as CoverageRow['coverage_status'],
  }));

  // Resolve the referenced work_board_items so covered rows can show something
  // more useful than a bare uuid. There is no work-board detail route in the app
  // yet (only /pipeline/[itemId] for agentic_items, a different table), so these
  // render as non-linking chips — title + short id.
  const workItemIds = Array.from(
    new Set(rows.flatMap((r) => r.work_item_ids)),
  );

  const workItems: Record<string, WorkItemRef> = {};
  if (workItemIds.length > 0) {
    const { data: wbi } = await supabase
      .from('work_board_items')
      .select('id, title, status')
      .in('id', workItemIds);
    for (const w of wbi ?? []) {
      workItems[w.id] = { id: w.id, title: w.title ?? '', status: w.status ?? null };
    }
  }

  return <TicketsBoard rows={rows} workItems={workItems} />;
}
