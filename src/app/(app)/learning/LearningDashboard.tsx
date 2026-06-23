'use client';

import { useState, useMemo } from 'react';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import {
  TRIGGER_TYPE_LABELS,
  RESOLUTION_ACTION_LABELS,
  RESOLUTION_ACTION_CONFIG,
  GRADUATION_STATUS_CONFIG,
  OUTCOME_CONFIG,
} from '@/lib/learning';
import { timeAgo } from '@/lib/constants';

// ── Types ──

type ResolutionRow = {
  id: string;
  item_id: string;
  trigger_type: string;
  trigger_h_class: string | null;
  resolution_action: string;
  resolution_detail: string | null;
  item_outcome: string;
  item_work_type: string | null;
  item_risk_tier: string | null;
  created_by: string;
  created_at: string;
};

type RuleRow = {
  id: string;
  trigger_type: string;
  trigger_h_class: string | null;
  expected_action: string;
  total_observations: number;
  matching_observations: number;
  confidence: number | null;
  min_observations: number;
  min_confidence: number;
  status: string;
  proposed_at: string | null;
  graduated_at: string | null;
  updated_at: string | null;
};

type ProposalRow = {
  id: string;
  rule_id: string;
  item_id: string;
  proposed_action: string;
  proposed_detail: string | null;
  human_decision: string | null;
  human_actual_action: string | null;
  created_at: string;
  decided_at: string | null;
};

interface LearningDashboardProps {
  initialResolutions: ResolutionRow[];
  initialRules: RuleRow[];
  initialProposals: ProposalRow[];
}

// ── Tabs ──

const TABS = [
  { key: 'resolutions', label: 'Resolutions' },
  { key: 'rules', label: 'Graduation Rules' },
  { key: 'proposals', label: 'Proposals' },
] as const;

type TabKey = typeof TABS[number]['key'];

export function LearningDashboard({ initialResolutions, initialRules, initialProposals }: LearningDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('resolutions');

  const { data: resolutions } = useRealtimeTable<ResolutionRow>(
    'human_resolution_log', initialResolutions
  );
  const { data: rules } = useRealtimeTable<RuleRow>(
    'graduation_rules', initialRules
  );
  const { data: proposals } = useRealtimeTable<ProposalRow>(
    'graduation_proposals', initialProposals
  );

  // ── Summary stats ──
  const stats = useMemo(() => {
    const totalResolutions = resolutions.length;
    const pendingOutcomes = resolutions.filter(r => r.item_outcome === 'pending').length;
    const totalRules = rules.length;
    const collectingRules = rules.filter(r => r.status === 'collecting').length;
    const proposingRules = rules.filter(r => r.status === 'proposing').length;
    const graduatedRules = rules.filter(r => r.status === 'graduated').length;
    const pendingProposals = proposals.filter(p => !p.human_decision).length;
    return { totalResolutions, pendingOutcomes, totalRules, collectingRules, proposingRules, graduatedRules, pendingProposals };
  }, [resolutions, rules, proposals]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Resolutions" value={stats.totalResolutions} sub={`${stats.pendingOutcomes} pending`} />
        <StatCard label="Rules" value={stats.totalRules} sub={`${stats.collectingRules} collecting`} />
        <StatCard label="Graduated" value={stats.graduatedRules} sub={`${stats.proposingRules} proposing`} />
        <StatCard label="Proposals" value={proposals.length} sub={`${stats.pendingProposals} pending`} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--muted)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-[8px] px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
            {tab.key === 'proposals' && stats.pendingProposals > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {stats.pendingProposals}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'resolutions' && <ResolutionsSection rows={resolutions} />}
      {activeTab === 'rules' && <RulesSection rows={rules} />}
      {activeTab === 'proposals' && <ProposalsSection rows={proposals} />}
    </div>
  );
}

// ── Stat card ──

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{sub}</p>
    </div>
  );
}

// ── Section: Resolutions ──

function ResolutionsSection({ rows }: { rows: ResolutionRow[] }) {
  const [filterTrigger, setFilterTrigger] = useState<string>('all');

  const filtered = useMemo(() => {
    if (filterTrigger === 'all') return rows;
    return rows.filter(r => r.trigger_type === filterTrigger);
  }, [rows, filterTrigger]);

  const triggers = useMemo(() => {
    const set = new Set(rows.map(r => r.trigger_type));
    return Array.from(set).sort();
  }, [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState message="No human resolutions captured yet. Approve or reject items in the Approvals view to start building the learning dataset." />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">Filter:</span>
        <button
          onClick={() => setFilterTrigger('all')}
          className={`rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
            filterTrigger === 'all'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          All ({rows.length})
        </button>
        {triggers.map((t) => {
          const count = rows.filter(r => r.trigger_type === t).length;
          return (
            <button
              key={t}
              onClick={() => setFilterTrigger(t)}
              className={`rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
                filterTrigger === t
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {TRIGGER_TYPE_LABELS[t as keyof typeof TRIGGER_TYPE_LABELS] ?? t} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Item</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Trigger</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Action</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Outcome</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">By</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map((row) => {
              const actionCfg = RESOLUTION_ACTION_CONFIG[row.resolution_action] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)' };
              const outcomeCfg = OUTCOME_CONFIG[row.item_outcome] ?? OUTCOME_CONFIG.pending;
              return (
                <tr key={row.id} className="bg-[var(--card)] hover:bg-[var(--muted)]">
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] font-semibold">{row.item_id.substring(0, 8).toUpperCase()}</span>
                    {row.trigger_h_class && (
                      <span className="ml-1 rounded-[4px] bg-[#F3E8FF] px-1 py-0.5 text-[10px] font-medium text-[#7C3AED]">
                        {row.trigger_h_class}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {TRIGGER_TYPE_LABELS[row.trigger_type as keyof typeof TRIGGER_TYPE_LABELS] ?? row.trigger_type}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: actionCfg.bg, color: actionCfg.text }}
                    >
                      {RESOLUTION_ACTION_LABELS[row.resolution_action as keyof typeof RESOLUTION_ACTION_LABELS] ?? row.resolution_action}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: outcomeCfg.bg, color: outcomeCfg.text }}
                    >
                      {outcomeCfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{row.created_by}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{timeAgo(row.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Graduation Rules ──

function RulesSection({ rows }: { rows: RuleRow[] }) {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return rows;
    return rows.filter(r => r.status === filterStatus);
  }, [rows, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState message="No graduation rules seeded yet. The learning layer seeds rules automatically when running in capture mode." />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">Status:</span>
        <button
          onClick={() => setFilterStatus('all')}
          className={`rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
            filterStatus === 'all'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          All ({rows.length})
        </button>
        {Object.entries(statusCounts).map(([status, count]) => {
          const cfg = GRADUATION_STATUS_CONFIG[status] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)', label: status };
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Trigger</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">H-Class</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Expected</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Observations</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Match %</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map((rule) => {
              const statusCfg = GRADUATION_STATUS_CONFIG[rule.status] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)', label: rule.status };
              const matchPct = rule.total_observations > 0
                ? Math.round((rule.matching_observations / rule.total_observations) * 100)
                : 0;
              const progressWidth = rule.min_observations > 0
                ? Math.min(100, Math.round((rule.total_observations / rule.min_observations) * 100))
                : 0;
              return (
                <tr key={rule.id} className="bg-[var(--card)] hover:bg-[var(--muted)]">
                  <td className="px-3 py-2 text-[var(--foreground)]">
                    {TRIGGER_TYPE_LABELS[rule.trigger_type as keyof typeof TRIGGER_TYPE_LABELS] ?? rule.trigger_type}
                  </td>
                  <td className="px-3 py-2">
                    {rule.trigger_h_class ? (
                      <span className="rounded-[4px] bg-[#F3E8FF] px-1 py-0.5 text-[10px] font-medium text-[#7C3AED]">
                        {rule.trigger_h_class}
                      </span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[var(--foreground)]">
                      {RESOLUTION_ACTION_LABELS[rule.expected_action as keyof typeof RESOLUTION_ACTION_LABELS] ?? rule.expected_action}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-[var(--foreground)]">
                        {rule.total_observations}/{rule.min_observations}
                      </span>
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all"
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`tabular-nums font-medium ${
                      matchPct >= (rule.min_confidence * 100)
                        ? 'text-emerald-600'
                        : matchPct > 0
                        ? 'text-amber-600'
                        : 'text-[var(--muted-foreground)]'
                    }`}>
                      {rule.total_observations > 0 ? `${matchPct}%` : '—'}
                    </span>
                    <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">
                      (min {Math.round(rule.min_confidence * 100)}%)
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: statusCfg.bg, color: statusCfg.text }}
                    >
                      {statusCfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Proposals ──

function ProposalsSection({ rows }: { rows: ProposalRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState message="No graduation proposals yet. Proposals appear when the learning layer detects consistent human resolution patterns that could be automated." />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((p) => {
        const isPending = !p.human_decision;
        const actionCfg = RESOLUTION_ACTION_CONFIG[p.proposed_action] ?? { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)' };
        return (
          <div
            key={p.id}
            className={`rounded-[10px] border p-3 ${
              isPending
                ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                : 'border-[var(--border)] bg-[var(--card)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[var(--foreground)]">
                    Item {p.item_id.substring(0, 8).toUpperCase()}
                  </span>
                  <span
                    className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: actionCfg.bg, color: actionCfg.text }}
                  >
                    {RESOLUTION_ACTION_LABELS[p.proposed_action as keyof typeof RESOLUTION_ACTION_LABELS] ?? p.proposed_action}
                  </span>
                  {isPending && (
                    <span className="rounded-[6px] bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Pending review
                    </span>
                  )}
                  {p.human_decision && (
                    <span className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium ${
                      p.human_decision === 'agree'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {p.human_decision === 'agree' ? 'Agreed' : 'Disagreed'}
                    </span>
                  )}
                </div>
                {p.proposed_detail && (
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{p.proposed_detail}</p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                {timeAgo(p.created_at)}
              </span>
            </div>
            {p.human_actual_action && (
              <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                Human chose: <span className="font-medium text-[var(--foreground)]">
                  {RESOLUTION_ACTION_LABELS[p.human_actual_action as keyof typeof RESOLUTION_ACTION_LABELS] ?? p.human_actual_action}
                </span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ──

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--muted)]">
        <svg className="h-6 w-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
        </svg>
      </div>
      <p className="mt-3 max-w-md mx-auto text-sm text-[var(--muted-foreground)]">{message}</p>
    </div>
  );
}
