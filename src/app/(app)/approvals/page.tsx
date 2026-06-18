import { createServerClient } from '@/lib/supabase/server';
import { HUMAN_GATE_STATUSES } from '@/lib/constants';
import { ApprovalsBoard } from './ApprovalsBoard';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, updated_at, escalated_at, escalation_reason, final_design_summary')
    .in('status', HUMAN_GATE_STATUSES as unknown as string[])
    .order('updated_at', { ascending: true });

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Failed to load approval items</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data as any[]) ?? []).map((row: any) => ({
    id: row.id as string,
    title: (row.title ?? '') as string,
    status: (row.status ?? 'human_review') as string,
    priority: (row.priority ?? 'p3') as string,
    repo: (row.repo ?? '') as string,
    updated_at: (row.updated_at ?? new Date().toISOString()) as string,
    escalated_at: (row.escalated_at ?? null) as string | null,
    escalation_reason: (row.escalation_reason ?? null) as string | null,
    final_design_summary: (row.final_design_summary ?? null) as string | null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
        Items needing human action
      </p>
      <ApprovalsBoard initialItems={items} />
    </div>
  );
}
