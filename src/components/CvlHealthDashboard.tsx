'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { timeAgo } from '@/lib/constants';
import { HealthCard, type HealthStatus } from '@/components/HealthCard';

// ── Row shapes (subset of the cvl_* tables in the BS Box conductor project) ──

export type CvlDashboardRow = {
  id: string;
  category: string;
  status: string; // 'green' | 'yellow' | 'red' | 'unknown'
  trend: string | null;
  finding_count_critical: number;
  finding_count_high: number;
  finding_count_medium: number;
  finding_count_low: number;
  last_scan_at: string | null;
  last_scan_type: string | null;
  last_scan_duration_ms: number | null;
};

export type CvlScanRow = {
  id: string;
  scan_type: string;
  status: string;
  findings_new: number | null;
  findings_updated: number | null;
  findings_resolved: number | null;
  findings_total: number | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
};

export type CvlFindingRow = {
  id: string;
  category: string;
  module: string | null;
  check_name: string | null;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  suggested_action: string | null;
  auto_healable: boolean | null;
  first_seen: string | null;
  last_seen: string | null;
  created_at: string;
};

interface CvlHealthDashboardProps {
  initialDashboard: CvlDashboardRow[];
  initialScans: CvlScanRow[];
  initialFindings: CvlFindingRow[];
  fetchedAt: string;
}

// ── Display helpers ──

const CATEGORY_LABELS: Record<string, string> = {
  build_artifacts: 'Build Artifacts',
  deployment: 'Deployment',
  infrastructure: 'Infrastructure',
  item_status: 'Item Status',
  pipeline_flow: 'Pipeline Flow',
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Map the CVL colour status onto the shared HealthCard status set.
function toHealthStatus(status: string): HealthStatus {
  switch (status) {
    case 'green': return 'healthy';
    case 'yellow': return 'warning';
    case 'red': return 'critical';
    default: return 'unknown';
  }
}

// Derive a 0–100 health score from a category's finding counts. Unknown/unscanned
// categories return null so the card shows a status label instead of a percentage.
function categoryScore(row: CvlDashboardRow): number | null {
  if (row.status === 'unknown' || !row.last_scan_at) return null;
  const penalty =
    row.finding_count_critical * 30 +
    row.finding_count_high * 12 +
    row.finding_count_medium * 4 +
    row.finding_count_low * 1;
  return Math.max(0, Math.min(100, 100 - penalty));
}

// CVL finding severities: critical | high | medium | low.
const SEVERITY_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  high:     { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' },
  medium:   { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  low:      { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
};

const SCAN_STATUS_DOT: Record<string, string> = {
  complete: 'bg-emerald-500',
  running: 'bg-blue-500 animate-pulse',
  partial: 'bg-amber-500',
  failed: 'bg-red-500',
  timeout: 'bg-amber-500',
};

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function CvlHealthDashboard({
  initialDashboard,
  initialScans,
  initialFindings,
  fetchedAt,
}: CvlHealthDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Live-update the category summary cards; findings/scans refresh on demand.
  const { data: dashboard } = useRealtimeTable<CvlDashboardRow>(
    'cvl_health_dashboard', initialDashboard
  );

  const sortedDashboard = [...dashboard].sort((a, b) =>
    a.category.localeCompare(b.category)
  );

  const findings = [...initialFindings].sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return new Date(b.last_seen ?? b.created_at).getTime() - new Date(a.last_seen ?? a.created_at).getTime();
  });

  const visibleFindings = severityFilter === 'all'
    ? findings
    : findings.filter((f) => f.severity === severityFilter);

  // Totals across all open findings for the header strip.
  const totals = findings.reduce(
    (acc, f) => {
      acc.total += 1;
      if (f.severity in acc.bySeverity) acc.bySeverity[f.severity] += 1;
      return acc;
    },
    { total: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number> }
  );

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Category summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {sortedDashboard.map((row) => {
          const counts = [
            row.finding_count_critical && `${row.finding_count_critical} crit`,
            row.finding_count_high && `${row.finding_count_high} high`,
            row.finding_count_medium && `${row.finding_count_medium} med`,
            row.finding_count_low && `${row.finding_count_low} low`,
          ].filter(Boolean).join(' · ');
          const subtitle = row.last_scan_at
            ? counts || `Clean · ${timeAgo(row.last_scan_at)}`
            : 'Not scanned';
          return (
            <HealthCard
              key={row.id}
              title={categoryLabel(row.category)}
              status={toHealthStatus(row.status)}
              score={categoryScore(row)}
              subtitle={subtitle}
            />
          );
        })}
      </div>

      {/* Open findings */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Open Findings</h2>
            <span className="text-xs text-[var(--muted-foreground)]">{totals.total} total</span>
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const count = sev === 'all' ? totals.total : totals.bySeverity[sev];
              const active = severityFilter === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded-[6px] border px-2 py-1 text-[11px] capitalize transition-colors ${
                    active
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {sev} {count > 0 && <span className="opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
        </div>
        {visibleFindings.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
            {severityFilter === 'all' ? 'No open findings' : `No open ${severityFilter} findings`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Severity</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Category</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Module</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Title</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Heal</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visibleFindings.map((f) => {
                  const badge = SEVERITY_BADGE[f.severity] ?? SEVERITY_BADGE.low;
                  return (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span
                          className="inline-flex rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: badge.bg, borderColor: badge.border, color: badge.text }}
                        >
                          {f.severity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-[var(--muted-foreground)]">
                        {categoryLabel(f.category)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-[var(--muted-foreground)]">
                        {f.module ?? '—'}
                      </td>
                      <td className="max-w-md px-4 py-2 text-xs" title={f.detail ?? undefined}>
                        <span className="font-medium">{f.title}</span>
                        {f.suggested_action && (
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--muted-foreground)]">
                            → {f.suggested_action}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs">
                        {f.auto_healable ? (
                          <span className="text-emerald-600 dark:text-emerald-400">auto</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">manual</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[10px] text-[var(--muted-foreground)]">
                        {f.last_seen ? timeAgo(f.last_seen) : timeAgo(f.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent scan runs */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold">Recent Scans</h2>
          <button
            onClick={refresh}
            disabled={isPending}
            className="rounded-[8px] border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {initialScans.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
            No scan runs recorded
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Started</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Type</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Status</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-[var(--muted-foreground)]">New</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-[var(--muted-foreground)]">Resolved</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-[var(--muted-foreground)]">Total</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-[var(--muted-foreground)]">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {initialScans.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[10px] text-[var(--muted-foreground)]">
                      {s.started_at ? timeAgo(s.started_at) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs">{s.scan_type}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${SCAN_STATUS_DOT[s.status] ?? 'bg-stone-400'}`} />
                        {s.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs">{s.findings_new ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs">{s.findings_resolved ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs">{s.findings_total ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-[var(--muted-foreground)]">
                      {formatMs(s.duration_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-right text-[10px] text-[var(--muted-foreground)]">
        Data fetched {timeAgo(fetchedAt)}
      </p>
    </div>
  );
}
