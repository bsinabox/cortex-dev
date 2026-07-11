import { createServerClient } from '@/lib/supabase/server';
import { PipelineBoard } from './PipelineBoard';
import { getUserKey } from '@/lib/auth';
import type { PipelineItem } from '@/components/ItemCard';

export const dynamic = 'force-dynamic';

export type BuildComponent = {
  id: string;
  component_code: string;
  name: string;
  description: string | null;
  status: string;
  owner: string;
};

export type BuildPlan = {
  component: BuildComponent;
  items: PipelineItem[];
};

export default async function PipelinePage() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  const currentUser = (user ? getUserKey(user.id) : null) ?? 'scott';

  const { data: components, error: compErr } = await supabase
    .from('build_components')
    .select('id, component_code, name, description, status, owner')
    .in('status', ['in_progress', 'testing', 'planned', 'discovery'])
    .order('component_code');

  const { data: rawItems, error: itemErr } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, batch_id, execution_policy, component_id, updated_at, escalated_at, escalation_reason, current_round')
    .not('status', 'in', '(cancelled,failed)')
    .order('updated_at', { ascending: false });

  if (compErr || itemErr) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <div className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load pipeline data</p>
          <p className="mt-1 font-mono text-xs">{compErr?.message ?? itemErr?.message}</p>
        </div>
      </div>
    );
  }

  const items: PipelineItem[] = (rawItems ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    status: row.status ?? 'intake',
    priority: row.priority ?? 'p3',
    repo: row.repo ?? '',
    batch_id: row.batch_id ?? null,
    execution_policy: row.execution_policy ?? null,
    component_id: row.component_id ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
    escalated_at: row.escalated_at ?? null,
    escalation_reason: row.escalation_reason ?? null,
    current_round: row.current_round ?? 0,
  }));

  const compMap = new Map<string, BuildComponent>();
  for (const c of (components ?? [])) {
    compMap.set(c.id, {
      id: c.id,
      component_code: c.component_code,
      name: c.name,
      description: c.description ?? null,
      status: c.status,
      owner: c.owner ?? 'scott',
    });
  }

  const planMap = new Map<string, PipelineItem[]>();
  const singles: PipelineItem[] = [];

  for (const item of items) {
    if (item.component_id && compMap.has(item.component_id)) {
      const list = planMap.get(item.component_id) ?? [];
      list.push(item);
      planMap.set(item.component_id, list);
    } else {
      singles.push(item);
    }
  }

  const plans: BuildPlan[] = [];
  for (const [compId, compItems] of planMap) {
    const comp = compMap.get(compId);
    if (comp) plans.push({ component: comp, items: compItems });
  }

  plans.sort((a, b) => b.items.length - a.items.length);

  return (
    <div>
      <PipelineBoard plans={plans} singles={singles} currentUser={currentUser} />
    </div>
  );
}
