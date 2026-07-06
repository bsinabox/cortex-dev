import { createServiceClient } from '@/lib/supabase/server';
import {
  CvlHealthDashboard,
  type CvlDashboardRow,
  type CvlScanRow,
  type CvlFindingRow,
} from '@/components/CvlHealthDashboard';

export const dynamic = 'force-dynamic';

// The cvl_* tables live in the same (BS Box conductor) Supabase project as the
// rest of cortex-dev, but they are cross-tenant CVL state guarded by RLS — read
// them with the service-role client after the layout has confirmed the caller
// is an authenticated Cortex user.
export default async function CvlHealthPage() {
  const service = await createServiceClient();

  const [dashboardRes, scansRes, findingsRes] = await Promise.all([
    service
      .from('cvl_health_dashboard')
      .select('id, category, status, trend, finding_count_critical, finding_count_high, finding_count_medium, finding_count_low, last_scan_at, last_scan_type, last_scan_duration_ms')
      .order('category', { ascending: true }),
    service
      .from('cvl_scan_runs')
      .select('id, scan_type, status, findings_new, findings_updated, findings_resolved, findings_total, started_at, completed_at, duration_ms')
      .order('started_at', { ascending: false })
      .limit(25),
    service
      .from('cvl_findings')
      .select('id, category, module, check_name, severity, status, title, detail, suggested_action, auto_healable, first_seen, last_seen, created_at')
      // Open findings only — mirror conductor-cvl.js OPEN_FINDING_FILTER
      // (status not in resolved, wont_fix). A plain neq('status','resolved')
      // would still count wont_fix rows as open.
      .not('status', 'in', '(resolved,wont_fix)')
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  const initialDashboard = (dashboardRes.data ?? []) as CvlDashboardRow[];
  const initialScans = (scansRes.data ?? []) as CvlScanRow[];
  const initialFindings = (findingsRes.data ?? []) as CvlFindingRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">CVL Health</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
        Continuous verification loop — category health, open findings &amp; scan runs
      </p>
      <CvlHealthDashboard
        initialDashboard={initialDashboard}
        initialScans={initialScans}
        initialFindings={initialFindings}
        fetchedAt={new Date().toISOString()}
      />
    </div>
  );
}
