import { createServerClient } from '@/lib/supabase/server';
import { PipelineBoard } from './PipelineBoard';
import type { PipelineItem } from '@/components/ItemCard';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, batch_id, execution_policy, updated_at, escalated_at, escalation_reason, current_round')
    .not('status', 'in', '(cancelled,failed)')
    .order('updated_at', { ascending: false });

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <div className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load pipeline data</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      </div>
    );
  }

  const items: PipelineItem[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    status: row.status ?? 'intake',
    priority: row.priority ?? 'p3',
    repo: row.repo ?? '',
    batch_id: row.batch_id ?? null,
    execution_policy: row.execution_policy ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
    escalated_at: row.escalated_at ?? null,
    escalation_reason: row.escalation_reason ?? null,
    current_round: row.current_round ?? 0,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Pipeline</h1>
      <PipelineBoard initialItems={items} />
    </div>
  );
}
