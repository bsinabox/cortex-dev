import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { isOperator as checkOperator } from '@/lib/auth';
import { HealthDashboard } from './HealthDashboard';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  const userIsOperator = user ? checkOperator(user.id) : false;

  const serviceClient = await createServiceClient();

  // Fetch config
  const { data: config } = await serviceClient
    .from('agentic_config')
    .select('key, value, updated_at')
    .order('key');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configRows = ((config as any[]) ?? []).map((row: any) => ({
    id: row.key as string,
    key: row.key as string,
    value: row.value,
    updated_at: row.updated_at as string,
  }));

  // Fetch ops log (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: opsLog } = await serviceClient
    .from('agentic_ops_log')
    .select('id, event_type, severity, description, status, item_id, created_at')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opsLogEntries = ((opsLog as any[]) ?? []).map((row: any) => ({
    id: row.id as string,
    event_type: (row.event_type ?? '') as string,
    severity: (row.severity ?? 'info') as string,
    description: (row.description ?? '') as string,
    status: (row.status ?? 'open') as string,
    item_id: (row.item_id ?? null) as string | null,
    created_at: (row.created_at ?? new Date().toISOString()) as string,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
        System health, configuration &amp; operations
      </p>
      <HealthDashboard
        initialConfig={configRows}
        initialOpsLog={opsLogEntries}
        isOperator={userIsOperator}
      />
    </div>
  );
}
