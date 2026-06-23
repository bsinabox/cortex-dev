import { createServiceClient } from '@/lib/supabase/server';
import { LearningDashboard } from './LearningDashboard';

export const dynamic = 'force-dynamic';

export default async function LearningPage() {
  const supabase = await createServiceClient();

  // Recent human resolutions (last 50)
  const { data: resolutions } = await supabase
    .from('human_resolution_log')
    .select('id, item_id, trigger_type, trigger_h_class, resolution_action, resolution_detail, item_outcome, item_work_type, item_risk_tier, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolutionRows = ((resolutions as any[]) ?? []).map((row: any) => ({
    id: row.id as string,
    item_id: row.item_id as string,
    trigger_type: (row.trigger_type ?? '') as string,
    trigger_h_class: (row.trigger_h_class ?? null) as string | null,
    resolution_action: (row.resolution_action ?? '') as string,
    resolution_detail: (row.resolution_detail ?? null) as string | null,
    item_outcome: (row.item_outcome ?? 'pending') as string,
    item_work_type: (row.item_work_type ?? null) as string | null,
    item_risk_tier: (row.item_risk_tier ?? null) as string | null,
    created_by: (row.created_by ?? '') as string,
    created_at: (row.created_at ?? new Date().toISOString()) as string,
  }));

  // Graduation rules
  const { data: rules } = await supabase
    .from('graduation_rules')
    .select('id, trigger_type, trigger_h_class, expected_action, total_observations, matching_observations, confidence, min_observations, min_confidence, status, proposed_at, graduated_at, updated_at')
    .order('status')
    .order('trigger_type');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruleRows = ((rules as any[]) ?? []).map((row: any) => ({
    id: row.id as string,
    trigger_type: (row.trigger_type ?? '') as string,
    trigger_h_class: (row.trigger_h_class ?? null) as string | null,
    expected_action: (row.expected_action ?? '') as string,
    total_observations: (row.total_observations ?? 0) as number,
    matching_observations: (row.matching_observations ?? 0) as number,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    min_observations: (row.min_observations ?? 10) as number,
    min_confidence: row.min_confidence != null ? Number(row.min_confidence) : 0.9,
    status: (row.status ?? 'collecting') as string,
    proposed_at: (row.proposed_at ?? null) as string | null,
    graduated_at: (row.graduated_at ?? null) as string | null,
    updated_at: (row.updated_at ?? null) as string | null,
  }));

  // Graduation proposals
  const { data: proposals } = await supabase
    .from('graduation_proposals')
    .select('id, rule_id, item_id, proposed_action, proposed_detail, human_decision, human_actual_action, created_at, decided_at')
    .order('created_at', { ascending: false })
    .limit(30);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposalRows = ((proposals as any[]) ?? []).map((row: any) => ({
    id: row.id as string,
    rule_id: row.rule_id as string,
    item_id: row.item_id as string,
    proposed_action: (row.proposed_action ?? '') as string,
    proposed_detail: (row.proposed_detail ?? null) as string | null,
    human_decision: (row.human_decision ?? null) as string | null,
    human_actual_action: (row.human_actual_action ?? null) as string | null,
    created_at: (row.created_at ?? new Date().toISOString()) as string,
    decided_at: (row.decided_at ?? null) as string | null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Learning</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
        Human resolution patterns, graduation rules &amp; proposals
      </p>
      <LearningDashboard
        initialResolutions={resolutionRows}
        initialRules={ruleRows}
        initialProposals={proposalRows}
      />
    </div>
  );
}
