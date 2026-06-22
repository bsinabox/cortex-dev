'use client';

import { useState, useMemo, useCallback, useRef, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type PipelineItem } from '@/components/ItemCard';
import { reassignComponent } from './actions';
import {
  PIPELINE_PHASES, getPhaseIndex, getPhaseForStatus, getPhasesForPolicy,
  QUEUE_STATUSES, BLOCKED_STATUSES, DONE_STATUSES, waitTime, REPO_CONFIG,
} from '@/lib/constants';

/* ─── Types ─── */

type BuildComponent = {
  id: string;
  component_code: string;
  name: string;
  description: string | null;
  status: string;
  owner: string;
};

type BuildPlan = {
  component: BuildComponent;
  items: PipelineItem[];
};

/* ─── Team members (expandable as BS grows) ─── */

const TEAM_MEMBERS = [
  { key: 'scott', label: 'Scott' },
  { key: 'brian', label: 'Brian' },
];

/* ─── Status badge config ─── */

// Full status → badge mapping (covers ALL statuses, no more "?")
function statusBadge(status: string): { label: string; bg: string; text: string } {
  // Pipeline phases
  const phase = getPhaseForStatus(status);
  if (phase) return { label: phase.short, bg: phase.bg, text: phase.text };

  // Done states
  if (status === 'done' || status === 'subtasks_complete')
    return { label: '✓', bg: '#D1FAE5', text: '#065F46' };

  // Queue/intake states
  if (status === 'intake' || status === 'awaiting_hub_design')
    return { label: 'Q', bg: '#F1F5F9', text: '#475569' };

  // Blocked states
  if (BLOCKED_STATUSES.includes(status))
    return { label: 'Blk', bg: '#FEE2E2', text: '#991B1B' };

  // Terminal
  if (status === 'cancelled') return { label: '✕', bg: '#F1F5F9', text: '#94A3B8' };
  if (status === 'failed') return { label: '!', bg: '#FEE2E2', text: '#991B1B' };

  return { label: '?', bg: '#F1F5F9', text: '#94A3B8' };
}

/* ─── Autonomous loop detection ─── */

const AUTONOMOUS_STATUSES = new Set([
  'approved', 'executing', 'qa', 'cross_review', 'designing', 'design_conflict',
]);

function isAutonomous(status: string): boolean {
  return AUTONOMOUS_STATUSES.has(status);
}

/* ─── Helpers ─── */

const SCOTT_ACTS = new Set(['testing_in_dev', 'awaiting_hub_design', 'intake', 'designing', 'cross_review', 'design_conflict']);
const BRIAN_ACTS = new Set(['human_review', 'design_review_hold', 'promotion_review']);

function isAction(status: string, person: string): boolean {
  return person === 'scott' ? SCOTT_ACTS.has(status) : BRIAN_ACTS.has(status);
}

function calcPlan(items: PipelineItem[], person: string) {
  const t = items.length;
  const bld = items.filter(i => ['approved', 'executing'].includes(i.status)).length;
  const qa = items.filter(i => ['qa', 'testing_in_dev'].includes(i.status)).length;
  const rev = items.filter(i => ['human_review', 'design_review_hold', 'cross_review'].includes(i.status)).length;
  const des = items.filter(i => ['designing', 'design_conflict'].includes(i.status)).length;
  const blk = items.filter(i => BLOCKED_STATUSES.includes(i.status)).length;
  const done = items.filter(i => DONE_STATUSES.includes(i.status)).length;
  const acts = items.filter(i => isAction(i.status, person)).length;
  const autoLoop = items.filter(i => isAutonomous(i.status)).length;
  const through = bld + qa + done;
  const pct = t > 0 ? Math.round((through / t) * 100) : 0;
  const minHours = items.length > 0
    ? Math.min(...items.map(i => (Date.now() - new Date(i.updated_at).getTime()) / 3600000))
    : 999;
  return { t, bld, qa, rev, des, blk, done, acts, autoLoop, through, pct, minHours };
}

function actionLabel(status: string): { text: string; bg: string } | null {
  if (status === 'testing_in_dev') return { text: 'Test', bg: '#0f766e' };
  if (status === 'human_review' || status === 'design_review_hold') return { text: 'Ship', bg: '#059669' };
  if (status === 'promotion_review') return { text: 'Promote', bg: '#7c3aed' };
  return null;
}

function statusHint(status: string): string {
  const hints: Record<string, string> = {
    human_review: 'Approve or request changes', testing_in_dev: 'Verify on dev then promote',
    design_review_hold: 'Review QA findings', approved: 'Queued for worker — autonomous',
    executing: 'Building right now — autonomous', qa: 'Running QA checks — autonomous',
    cross_review: 'Codex reviewing — autonomous', designing: 'Design in progress — autonomous',
    readiness_blocked: 'Waiting on dependencies', blocked: 'Needs intervention',
    awaiting_hub_design: 'Needs design session', done: 'Completed — no action needed',
    cancelled: 'Cancelled — no action needed',
  };
  return hints[status] ?? status;
}

/* ─── Active filter ─── */

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function isActiveItem(item: PipelineItem): boolean {
  if (['done', 'subtasks_complete', 'cancelled', 'failed'].includes(item.status)) return false;
  if (item.status === 'human_review') {
    const ageMs = Date.now() - new Date(item.updated_at).getTime();
    if (ageMs > FORTY_EIGHT_HOURS_MS) return false;
  }
  return true;
}

/* ─── Batch formatting ─── */

function formatBatchId(batchId: string): string {
  return batchId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ─── Component ─── */

interface PipelineBoardProps {
  plans: BuildPlan[];
  singles: PipelineItem[];
}

const PULL_THRESHOLD = 80;

export function PipelineBoard({ plans: initialPlans, singles: initialSingles }: PipelineBoardProps) {
  const { data: allItems, refresh } = useRealtimeTable<PipelineItem>('agentic_items', [
    ...initialPlans.flatMap(p => p.items),
    ...initialSingles,
  ]);

  const [person, setPerson] = useState<'scott' | 'brian'>('scott');
  const [drillId, setDrillId] = useState<string | null>(null);

  // Track component owners locally for optimistic updates
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, string>>({});

  // Active filter (default ON)
  const [activeOnly, setActiveOnly] = useState(true);

  // Repo filter (persisted in localStorage)
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem('cortex-pipeline-repo-filter');
    if (stored) setRepoFilter(stored);
  }, []);
  const handleRepoFilter = useCallback((repo: string | null) => {
    setRepoFilter(repo);
    if (repo) localStorage.setItem('cortex-pipeline-repo-filter', repo);
    else localStorage.removeItem('cortex-pipeline-repo-filter');
  }, []);

  // Pull-to-refresh
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchY = useRef(0);
  const onTS = useCallback((e: React.TouchEvent) => { if (window.scrollY === 0) touchY.current = e.touches[0].clientY; }, []);
  const onTM = useCallback((e: React.TouchEvent) => { if (refreshing || window.scrollY > 0) return; const d = e.touches[0].clientY - touchY.current; if (d > 0) setPullDist(Math.min(d * 0.5, PULL_THRESHOLD + 20)); }, [refreshing]);
  const onTE = useCallback(async () => { if (pullDist >= PULL_THRESHOLD && !refreshing) { setRefreshing(true); setPullDist(PULL_THRESHOLD); await refresh(); setRefreshing(false); } setPullDist(0); }, [pullDist, refreshing, refresh]);

  // Available repos (unfiltered, for filter pills)
  const availableRepos = useMemo(() => {
    const repos = new Set<string>();
    for (const item of allItems) { if (item.repo) repos.add(item.repo); }
    return Array.from(repos).sort();
  }, [allItems]);

  // Regroup items by component using live data, with filters + recency sort
  const { livePlans, liveSingles } = useMemo(() => {
    const compMap = new Map<string, BuildComponent>();
    for (const p of initialPlans) {
      const comp = { ...p.component };
      if (ownerOverrides[comp.id]) comp.owner = ownerOverrides[comp.id];
      compMap.set(comp.id, comp);
    }

    let filtered: PipelineItem[] = repoFilter
      ? allItems.filter(i => i.repo === repoFilter)
      : allItems;

    filtered = [...filtered].sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const planItems = new Map<string, PipelineItem[]>();
    let sng: PipelineItem[] = [];

    for (const item of filtered) {
      if (item.component_id && compMap.has(item.component_id)) {
        const list = planItems.get(item.component_id) ?? [];
        list.push(item);
        planItems.set(item.component_id, list);
      } else {
        sng.push(item);
      }
    }

    let lp: BuildPlan[] = [];
    for (const [cid, items] of planItems) {
      const comp = compMap.get(cid);
      if (comp) lp.push({ component: comp, items });
    }

    if (activeOnly) {
      lp = lp.filter(p => p.items.some(isActiveItem));
      sng = sng.filter(isActiveItem);
    }

    lp.sort((a, b) => b.items.length - a.items.length);
    return { livePlans: lp, liveSingles: sng };
  }, [allItems, initialPlans, ownerOverrides, activeOnly, repoFilter]);

  // Filter by person
  const personPlans = livePlans.filter(p => p.component.owner === person);
  const personSingles = liveSingles.filter(i => {
    if (['cancelled', 'failed'].includes(i.status)) return false;
    return isAction(i.status, person) ||
      (!SCOTT_ACTS.has(i.status) && !BRIAN_ACTS.has(i.status) && person === 'scott');
  });

  // Drill target
  const drillPlan = drillId ? personPlans.find(p => p.component.id === drillId) ?? null : null;

  // Batch grouping for singles
  const { batchGroups, ungroupedSingles } = useMemo(() => {
    const groups = new Map<string, PipelineItem[]>();
    const ungrouped: PipelineItem[] = [];
    for (const item of personSingles) {
      if (item.batch_id) {
        const list = groups.get(item.batch_id) ?? [];
        list.push(item);
        groups.set(item.batch_id, list);
      } else {
        ungrouped.push(item);
      }
    }
    return { batchGroups: groups, ungroupedSingles: ungrouped };
  }, [personSingles]);

  // Activity counts across all person plans
  const allPersonItems = [...personPlans.flatMap(p => p.items), ...personSingles];
  const bldCount = allPersonItems.filter(i => ['approved', 'executing'].includes(i.status)).length;
  const qaCount = allPersonItems.filter(i => i.status === 'qa').length;
  const actCount = allPersonItems.filter(i => isAction(i.status, person)).length;

  // Owner reassignment handler
  const handleReassign = useCallback(async (componentId: string, newOwner: string) => {
    setOwnerOverrides(prev => ({ ...prev, [componentId]: newOwner }));
    const result = await reassignComponent(componentId, newOwner);
    if (!result.ok) {
      setOwnerOverrides(prev => {
        const next = { ...prev };
        delete next[componentId];
        return next;
      });
    }
  }, []);

  return (
    <div onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
      {/* Pull-to-refresh */}
      {(pullDist > 0 || refreshing) && (
        <div className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
          style={{ height: refreshing ? 40 : pullDist > 0 ? pullDist : 0 }}>
          <span className={`text-xs text-[var(--muted-foreground)] ${refreshing ? 'animate-pulse' : ''}`}>
            {refreshing ? 'Refreshing...' : pullDist >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold tracking-tight lg:text-2xl">Pipeline</h1>
        <div className="flex overflow-hidden rounded-[8px] border border-[var(--border)]">
          {(['scott', 'brian'] as const).map(p => (
            <button key={p} onClick={() => { setPerson(p); setDrillId(null); }}
              className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                person === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background)] text-[var(--muted-foreground)]'
              }`}>
              {p === 'scott' ? 'Mine' : 'Brian'}
            </button>
          ))}
        </div>
      </div>

      {/* Activity bar */}
      <div className={`mb-3 flex items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-[10px] ${
        bldCount + qaCount > 0
          ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
          : 'border-[var(--border)] bg-[var(--card)]'
      }`}>
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          bldCount + qaCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--muted-foreground)] opacity-40'
        }`} />
        {bldCount + qaCount > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2">
            {bldCount > 0 && <span className="font-semibold text-emerald-700 dark:text-emerald-300">{bldCount} building</span>}
            {qaCount > 0 && <span className="font-semibold text-teal-700 dark:text-teal-300">{qaCount} QA</span>}
          </div>
        ) : (
          <span className="text-[var(--muted-foreground)]">Pipeline idle</span>
        )}
        {actCount > 0 && (
          <span className="ml-auto shrink-0 font-semibold text-red-500">
            {actCount} waiting on {person === 'scott' ? 'you' : 'Brian'}
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setActiveOnly(!activeOnly)}
          className={`rounded-[6px] border px-2 py-1 text-[10px] font-semibold transition-colors ${
            activeOnly
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]'
          }`}>
          Active now
        </button>
        <span className="text-[10px] text-[var(--muted-foreground)]">&middot;</span>
        <button onClick={() => handleRepoFilter(null)}
          className={`rounded-[6px] border px-2 py-1 text-[10px] font-semibold transition-colors ${
            !repoFilter
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]'
          }`}>
          All
        </button>
        {availableRepos.map(repo => {
          const cfg = REPO_CONFIG[repo] ?? { label: repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
          const active = repoFilter === repo;
          return (
            <button key={repo} onClick={() => handleRepoFilter(active ? null : repo)}
              className="rounded-[6px] border px-2 py-1 text-[10px] font-semibold transition-colors"
              style={active
                ? { borderColor: cfg.text, background: cfg.bg, color: cfg.text }
                : { borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)' }
              }>
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* ─── GRID VIEW ─── */}
      {!drillPlan && (
        <div>
          {personPlans.map(plan => (
            <PlanCard key={plan.component.id} plan={plan} person={person} onDrill={() => setDrillId(plan.component.id)} />
          ))}

          {personPlans.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[var(--border)] p-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No active build plans for {person === 'scott' ? 'you' : 'Brian'}</p>
            </div>
          )}

          {personSingles.length > 0 && (
            <>
              <div className="px-1 pb-1 pt-3 text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Individual Items ({personSingles.length})
              </div>
              {Array.from(batchGroups.entries()).map(([batchId, items]) => (
                <BatchGroup key={batchId} batchId={batchId} items={items} person={person} />
              ))}
              {ungroupedSingles.map(item => (
                <SingleRow key={item.id} item={item} person={person} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── DRILL VIEW ─── */}
      {drillPlan && (
        <DrillView plan={drillPlan} person={person} onBack={() => setDrillId(null)} onReassign={handleReassign} />
      )}
    </div>
  );
}

/* ─── Build Plan Card ─── */

function PlanCard({ plan, person, onDrill }: { plan: BuildPlan; person: string; onDrill: () => void }) {
  const s = calcPlan(plan.items, person);
  const idle = s.pct === 0 && s.bld === 0 && s.qa === 0 && s.rev === 0 && s.des === 0;

  const pills: { label: string; color: string }[] = [];
  if (s.des > 0) pills.push({ label: `Design ${s.des}`, color: '#8b5cf6' });
  if (s.rev > 0) pills.push({ label: `Review ${s.rev}`, color: '#f59e0b' });
  if (s.bld > 0) pills.push({ label: `Building ${s.bld}`, color: '#3b82f6' });
  if (s.qa > 0) pills.push({ label: `Testing ${s.qa}`, color: '#14b8a6' });
  if (s.done > 0) pills.push({ label: `Complete ${s.done}`, color: '#10b981' });
  if (s.blk > 0) pills.push({ label: `Blocked ${s.blk}`, color: '#ef4444' });

  const barPct = s.pct;
  const barColors: string[] = [];
  if (s.des > 0) barColors.push('#8b5cf6');
  if (s.rev > 0) barColors.push('#f59e0b');
  if (s.bld > 0) barColors.push('#3b82f6');
  if (s.qa > 0) barColors.push('#14b8a6');
  if (s.done > 0) barColors.push('#10b981');
  const barBg = barColors.length > 1
    ? `linear-gradient(90deg, ${barColors.join(', ')})`
    : barColors[0] ?? 'var(--muted)';

  const ownerLabel = TEAM_MEMBERS.find(m => m.key === plan.component.owner)?.label ?? plan.component.owner;

  return (
    <div
      onClick={onDrill}
      className={`mb-2 cursor-pointer rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 transition-colors active:border-[var(--primary)] ${idle ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--muted-foreground)]">Build Progress</span>
        <span className="ml-auto rounded-[4px] bg-[var(--muted)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--muted-foreground)]">
          {ownerLabel}
        </span>
      </div>

      <div className="mt-1 flex items-start justify-between">
        <div className="min-w-0 flex-1 pr-3">
          <div className="text-[15px] font-bold leading-snug">{plan.component.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[30px] font-extrabold leading-none text-[var(--primary)]">{s.pct}%</div>
          <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{s.t} items</div>
        </div>
      </div>

      {plan.component.description && (
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
          {plan.component.description}
        </p>
      )}

      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[var(--muted)]">
        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barBg }} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {pills.map(p => (
          <span key={p.label} className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>

      <div className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">
        Last activity: {waitTime(new Date(Date.now() - s.minHours * 3600000).toISOString())} ago
      </div>

      {/* Action needed callout */}
      {s.acts > 0 && (
        <div className="mt-1.5 flex items-center gap-2 rounded-[6px] border border-red-200 bg-red-50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/30">
          <span className="text-[14px] font-extrabold text-red-500">{s.acts}</span>
          <span className="text-[10px] text-red-400">
            item{s.acts > 1 ? 's' : ''} waiting on {person === 'scott' ? 'you' : 'Brian'}
          </span>
        </div>
      )}

      {/* Autonomous loop callout */}
      {s.autoLoop > 0 && s.acts === 0 && (
        <div className="mt-1.5 flex items-center gap-2 rounded-[6px] border border-blue-200 bg-blue-50 px-2 py-1.5 dark:border-blue-800 dark:bg-blue-950/30">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span className="text-[10px] text-blue-600 dark:text-blue-300">
            {s.autoLoop} item{s.autoLoop > 1 ? 's' : ''} in autonomous loop — hands off
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Single item row ─── */

function SingleRow({ item, person }: { item: PipelineItem; person: string }) {
  const act = isAction(item.status, person);
  const sid = item.id.substring(0, 8).toUpperCase();
  const badge = statusBadge(item.status);
  const al = act ? actionLabel(item.status) : null;
  const repoCfg = REPO_CONFIG[item.repo];

  return (
    <Link href={`/pipeline/${item.id}`}
      className={`mb-0.5 flex items-center gap-1.5 rounded-[8px] border px-2.5 py-2 transition-colors active:border-[var(--primary)] ${
        act ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-[var(--border)] bg-[var(--card)]'
      }`}>
      <span className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</span>
      <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold" style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
      {repoCfg && (
        <span className="rounded-[3px] px-1 py-0.5 text-[7px] font-semibold" style={{ background: repoCfg.bg, color: repoCfg.text }}>
          {repoCfg.label}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
      <span className="text-[9px] text-[var(--muted-foreground)]">{waitTime(item.updated_at)}</span>
      {al && (
        <span className="rounded-[5px] px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: al.bg }}>{al.text}</span>
      )}
    </Link>
  );
}

/* ─── Batch Group (collapsible) ─── */

function BatchGroup({ batchId, items, person }: { batchId: string; items: PipelineItem[]; person: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const done = items.filter(i => DONE_STATUSES.includes(i.status)).length;

  return (
    <div className="mb-2">
      <button onClick={() => setCollapsed(!collapsed)}
        className="mb-0.5 flex w-full items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 text-left">
        <span className="text-[11px] font-bold">{formatBatchId(batchId)}</span>
        <span className="text-[10px] text-[var(--muted-foreground)]">{done}/{items.length} complete</span>
        <svg className={`ml-auto h-3 w-3 text-[var(--muted-foreground)] transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {!collapsed && items.map(item => (
        <SingleRow key={item.id} item={item} person={person} />
      ))}
    </div>
  );
}

/* ─── Drill View ─── */

function DrillView({ plan, person, onBack, onReassign }: { plan: BuildPlan; person: string; onBack: () => void; onReassign: (componentId: string, newOwner: string) => void }) {
  const s = calcPlan(plan.items, person);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pills: { label: string; color: string }[] = [];
  if (s.des > 0) pills.push({ label: `Design ${s.des}`, color: '#8b5cf6' });
  if (s.rev > 0) pills.push({ label: `Review ${s.rev}`, color: '#f59e0b' });
  if (s.bld > 0) pills.push({ label: `Building ${s.bld}`, color: '#3b82f6' });
  if (s.qa > 0) pills.push({ label: `Testing ${s.qa}`, color: '#14b8a6' });
  if (s.done > 0) pills.push({ label: `Complete ${s.done}`, color: '#10b981' });
  if (s.blk > 0) pills.push({ label: `Blocked ${s.blk}`, color: '#ef4444' });

  const barColors: string[] = [];
  if (s.des > 0) barColors.push('#8b5cf6');
  if (s.rev > 0) barColors.push('#f59e0b');
  if (s.bld > 0) barColors.push('#3b82f6');
  if (s.qa > 0) barColors.push('#14b8a6');
  if (s.done > 0) barColors.push('#10b981');
  const barBg = barColors.length > 1 ? `linear-gradient(90deg, ${barColors.join(', ')})` : barColors[0] ?? 'var(--muted)';

  const currentOwner = plan.component.owner;
  const ownerLabel = TEAM_MEMBERS.find(m => m.key === currentOwner)?.label ?? currentOwner;

  // Group items by category
  const activeItems = plan.items.filter(i => !['cancelled', 'failed'].includes(i.status));

  const actionItems = activeItems.filter(i => isAction(i.status, person));
  const autoItems = activeItems.filter(i => isAutonomous(i.status));
  const doneItems = activeItems.filter(i => DONE_STATUSES.includes(i.status));
  const blockedItems = activeItems.filter(i => BLOCKED_STATUSES.includes(i.status));
  const queueItems = activeItems.filter(i => QUEUE_STATUSES.includes(i.status) && !isAction(i.status, person));
  const otherItems = activeItems.filter(i =>
    !isAction(i.status, person) && !isAutonomous(i.status) &&
    !DONE_STATUSES.includes(i.status) && !BLOCKED_STATUSES.includes(i.status) &&
    !QUEUE_STATUSES.includes(i.status)
  );

  return (
    <div>
      <button onClick={onBack} className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
        <span>&#8592;</span> All plans
      </button>

      <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-bold">{plan.component.name}</div>
          </div>
          {/* Owner badge — tappable to reassign */}
          <div className="relative">
            <button
              onClick={() => setShowOwnerPicker(!showOwnerPicker)}
              className={`flex items-center gap-1 rounded-[6px] border px-2 py-1 text-[11px] font-semibold transition-colors ${
                isPending ? 'opacity-50' : 'hover:border-[var(--primary)]'
              } border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]`}
              disabled={isPending}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
              {ownerLabel}
            </button>
            {showOwnerPicker && (
              <div className="absolute right-0 top-full z-20 mt-1 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-lg">
                {TEAM_MEMBERS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => {
                      if (m.key !== currentOwner) {
                        startTransition(() => { onReassign(plan.component.id, m.key); });
                      }
                      setShowOwnerPicker(false);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] transition-colors hover:bg-[var(--muted)] ${
                      m.key === currentOwner ? 'font-bold text-[var(--primary)]' : 'text-[var(--foreground)]'
                    }`}
                  >
                    {m.key === currentOwner && (
                      <svg className="h-3 w-3 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                    {m.key !== currentOwner && <span className="w-3" />}
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {plan.component.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">{plan.component.description}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[26px] font-extrabold text-[var(--primary)]">{s.pct}%</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{s.through}/{s.t} through pipeline</span>
        </div>
        <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[var(--muted)]">
          <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: barBg }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {pills.map(p => (
            <span key={p.label} className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── ACTION NEEDED ── */}
      {actionItems.length > 0 && (
        <ItemSection
          label={`Action Needed (${actionItems.length})`}
          color="#EF4444"
          items={actionItems}
          person={person}
        />
      )}

      {/* ── AUTONOMOUS LOOP ── */}
      {autoItems.length > 0 && (
        <ItemSection
          label={`Autonomous Loop (${autoItems.length})`}
          color="#3B82F6"
          pulse
          items={autoItems}
          person={person}
          subtitle="Hands off — conductor is working"
        />
      )}

      {/* ── QUEUED ── */}
      {queueItems.length > 0 && (
        <ItemSection
          label={`Queued (${queueItems.length})`}
          color="#94A3B8"
          items={queueItems}
          person={person}
        />
      )}

      {/* ── BLOCKED ── */}
      {blockedItems.length > 0 && (
        <ItemSection
          label={`Blocked (${blockedItems.length})`}
          color="#EF4444"
          items={blockedItems}
          person={person}
        />
      )}

      {/* ── OTHER ── */}
      {otherItems.length > 0 && (
        <ItemSection
          label={`Other (${otherItems.length})`}
          color="#94A3B8"
          items={otherItems}
          person={person}
        />
      )}

      {/* ── DONE ── */}
      {doneItems.length > 0 && (
        <ItemSection
          label={`Done (${doneItems.length})`}
          color="#10B981"
          items={doneItems}
          person={person}
          collapsed
        />
      )}
    </div>
  );
}

/* ─── Item Section (collapsible group in drill view) ─── */

function ItemSection({ label, color, pulse, items, person, subtitle, collapsed: defaultCollapsed }: {
  label: string; color: string; pulse?: boolean;
  items: PipelineItem[]; person: string;
  subtitle?: string; collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-0.5 flex w-full items-center gap-1.5 px-1 py-1 text-left"
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
          style={{ background: color }}
        />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
        {subtitle && <span className="ml-1 text-[9px] text-[var(--muted-foreground)]">— {subtitle}</span>}
        <svg className={`ml-auto h-3 w-3 text-[var(--muted-foreground)] transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {!collapsed && items.map(item => (
        <DrillItem key={item.id} item={item} person={person} />
      ))}
    </div>
  );
}

/* ─── Drill Item (expandable with chevron) ─── */

function DrillItem({ item, person }: { item: PipelineItem; person: string }) {
  const [expanded, setExpanded] = useState(false);
  const act = isAction(item.status, person);
  const auto = isAutonomous(item.status);
  const sid = item.id.substring(0, 8).toUpperCase();
  const badge = statusBadge(item.status);
  const al = act ? actionLabel(item.status) : null;
  const round = item.current_round ?? 0;

  // Chevron data
  const phases = getPhasesForPolicy(item.execution_policy);
  const currentIdx = getPhaseIndex(item.status);
  const isBlocked = BLOCKED_STATUSES.includes(item.status);
  const isQueue = QUEUE_STATUSES.includes(item.status);
  const isDone = DONE_STATUSES.includes(item.status);

  return (
    <div className={`mb-1 overflow-hidden rounded-[8px] border ${
      act ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40'
        : auto ? 'border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20'
        : isDone ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10 opacity-60'
        : 'border-[var(--border)] bg-[var(--card)]'
    }`}>
      <div className="flex cursor-pointer items-center gap-1.5 px-2.5 py-2 active:bg-[var(--muted)]" onClick={() => setExpanded(!expanded)}>
        <Link href={`/pipeline/${item.id}`} onClick={e => e.stopPropagation()}
          className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</Link>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold" style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
        {round > 0 && (
          <span className={`rounded-[3px] px-1 py-0.5 text-[8px] font-bold ${round >= 3 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : round >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
            R{round}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
        <span className="text-[9px] text-[var(--muted-foreground)]">{waitTime(item.updated_at)}</span>
        {al && (
          <span className="rounded-[5px] px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: al.bg }}>{al.text}</span>
        )}
        {auto && !al && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] px-2.5 py-2">
          <p className="mb-2 text-[10px] text-[var(--muted-foreground)]">{statusHint(item.status)}</p>
          {/* Chevron */}
          <div className="flex gap-0.5">
            {phases.map((ph) => {
              const gIdx = PIPELINE_PHASES.findIndex(p => p.key === ph.key);
              let color = 'var(--muted)';
              if (isDone) {
                color = ph.dot; // all filled for done items
              } else if (!isBlocked && !isQueue) {
                if (gIdx < currentIdx) color = ph.dot;
                else if (gIdx === currentIdx) color = ph.dot;
              }
              return (
                <div key={ph.key} className="h-[5px] flex-1 rounded-full" style={{
                  background: color,
                  opacity: isDone ? 0.7 : gIdx === currentIdx ? 1 : gIdx < currentIdx ? 0.8 : 0.2,
                  animation: gIdx === currentIdx && !isBlocked && !isQueue && !isDone ? 'pulse 2s ease-in-out infinite' : undefined,
                }} />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[7px] text-[var(--muted-foreground)]">
            {phases.map((ph) => {
              const gIdx = PIPELINE_PHASES.findIndex(p => p.key === ph.key);
              if (isDone) return <span key={ph.key} className="text-emerald-500">{'\u2713'}{ph.short}</span>;
              if (gIdx < currentIdx) return <span key={ph.key} className="text-emerald-500">{'\u2713'}{ph.short}</span>;
              if (gIdx === currentIdx) return <span key={ph.key} className="font-bold" style={{ color: ph.dot }}>{ph.short}</span>;
              return <span key={ph.key}>{ph.short}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
