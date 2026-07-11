'use client';

import { useState, useMemo, useCallback, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type PipelineItem } from '@/components/ItemCard';
import { reassignComponent, reassignItem } from './actions';
import {
  PIPELINE_PHASES, getPhaseIndex, getPhaseForStatus, getPhasesForPolicy,
  QUEUE_STATUSES, BLOCKED_STATUSES, DONE_STATUSES, waitTime,
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
  { key: 'etta', label: 'Etta' },
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
const BRIAN_ACTS = new Set(['human_review', 'design_review_hold', 'promotion_review', 'awaiting_prod_promotion']);
// Etta owns nothing by default: items are only hers if explicitly assigned to 'etta'.
const ETTA_ACTS = new Set<string>();
// Every human-gate status across the team — used for the "All" filter's action bucket.
const ANY_ACTS = new Set([...SCOTT_ACTS, ...BRIAN_ACTS]);

function actsFor(person: string): Set<string> {
  if (person === 'brian') return BRIAN_ACTS;
  if (person === 'etta') return ETTA_ACTS;
  return SCOTT_ACTS;
}

function isAction(status: string, person: string): boolean {
  return actsFor(person).has(status);
}

// Action test that respects the "All" filter (any human gate) vs. a single person.
function isActionForFilter(status: string, person: string): boolean {
  if (person === 'all') return ANY_ACTS.has(status);
  return isAction(status, person);
}

// Ownership test: an EXPLICIT per-item assignee always wins over the status heuristic.
// (person is a single teammate here — the "all" filter is handled separately as show-everything.)
function itemBelongsTo(item: PipelineItem, person: string): boolean {
  if (item.assignee) return item.assignee === person;
  return isActionForFilter(item.status, person) ||
    // Autonomous / no-gate items have no owner — surface them under the operator (Scott) view.
    (!SCOTT_ACTS.has(item.status) && !BRIAN_ACTS.has(item.status) && person === 'scott');
}

// Is this item in `person`'s "Needs your action" bucket? Requires a real action label,
// and honors explicit assignee (a Scott-owned item shows in Scott's bucket grouped by ITS action).
function isPersonAction(item: PipelineItem, person: string): boolean {
  if (actionLabel(item.status) == null) return false;
  if (person === 'all') return isActionForFilter(item.status, 'all');
  return itemBelongsTo(item, person);
}

// Display order for the top "Needs your action" bucket, grouped by actionLabel().text.
const ACTION_ORDER = ['Start design', 'Approve design', 'Verify on dev', 'Promote → UAT', '2nd approval → prod'];

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
  if (status === 'testing_in_dev') return { text: 'Verify on dev', bg: '#0f766e' };
  if (status === 'human_review' || status === 'design_review_hold') return { text: 'Approve design', bg: '#059669' };
  if (status === 'promotion_review') return { text: 'Promote → UAT', bg: '#7c3aed' };
  if (status === 'awaiting_prod_promotion') return { text: '2nd approval → prod', bg: '#9d174d' };
  if (status === 'awaiting_hub_design' || status === 'intake') return { text: 'Start design', bg: '#475569' };
  return null;
}

function statusHint(status: string): string {
  const hints: Record<string, string> = {
    human_review: 'Approve or request changes', testing_in_dev: 'Verify on dev, then accept',
    design_review_hold: 'Review QA findings, then approve', approved: 'Queued for worker — autonomous',
    executing: 'Building right now — autonomous', qa: 'Running QA checks — autonomous',
    cross_review: 'Codex reviewing — autonomous', designing: 'Design in progress — autonomous',
    readiness_blocked: 'Waiting on dependencies', blocked: 'Needs intervention',
    awaiting_hub_design: 'Needs a design session', intake: 'Needs a design session',
    promotion_review: 'Promote dev → UAT', awaiting_prod_promotion: 'Needs a 2nd approver to promote to prod',
    done: 'Completed — no action needed', cancelled: 'Cancelled — no action needed',
  };
  return hints[status] ?? status;
}

/* ─── Component ─── */

interface PipelineBoardProps {
  plans: BuildPlan[];
  singles: PipelineItem[];
  currentUser: string;
}

const PULL_THRESHOLD = 80;

export function PipelineBoard({ plans: initialPlans, singles: initialSingles, currentUser }: PipelineBoardProps) {
  // Memoize so internal re-renders (filter/drill/optimistic state) don't hand the
  // realtime hook a fresh array literal every render, which would reset live data
  // and stack up re-renders that starve router.push navigation transitions.
  const initialItems = useMemo(
    () => [...initialPlans.flatMap(p => p.items), ...initialSingles],
    [initialPlans, initialSingles]
  );
  const { data: allItems, refresh } = useRealtimeTable<PipelineItem>('agentic_items', initialItems);

  // Filter is the logged-in user by default ("Mine"), any other team member, or "all".
  const [person, setPerson] = useState<string>(currentUser);

  // Human-readable subject for the active filter ("you" / "the team" / a teammate's name).
  const whoLabel = person === 'all'
    ? 'the team'
    : person === currentUser
      ? 'you'
      : (TEAM_MEMBERS.find(m => m.key === person)?.label ?? person);
  const [drillId, setDrillId] = useState<string | null>(null);

  // Track component owners locally for optimistic updates
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, string>>({});
  // Track per-item assignees locally for optimistic updates (null = explicitly unassigned).
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string | null>>({});

  // Pull-to-refresh
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchY = useRef(0);
  const onTS = useCallback((e: React.TouchEvent) => { if (window.scrollY === 0) touchY.current = e.touches[0].clientY; }, []);
  const onTM = useCallback((e: React.TouchEvent) => { if (refreshing || window.scrollY > 0) return; const d = e.touches[0].clientY - touchY.current; if (d > 0) setPullDist(Math.min(d * 0.5, PULL_THRESHOLD + 20)); }, [refreshing]);
  const onTE = useCallback(async () => { if (pullDist >= PULL_THRESHOLD && !refreshing) { setRefreshing(true); setPullDist(PULL_THRESHOLD); await refresh(); setRefreshing(false); } setPullDist(0); }, [pullDist, refreshing, refresh]);

  // Regroup items by component using live data
  const { livePlans, liveSingles } = useMemo(() => {
    const compMap = new Map<string, BuildComponent>();
    for (const p of initialPlans) {
      const comp = { ...p.component };
      if (ownerOverrides[comp.id]) comp.owner = ownerOverrides[comp.id];
      compMap.set(comp.id, comp);
    }

    const planItems = new Map<string, PipelineItem[]>();
    const sng: PipelineItem[] = [];

    for (const raw of allItems) {
      // Apply optimistic assignee override, if any.
      const item = Object.prototype.hasOwnProperty.call(assigneeOverrides, raw.id)
        ? { ...raw, assignee: assigneeOverrides[raw.id] }
        : raw;
      if (item.component_id && compMap.has(item.component_id)) {
        const list = planItems.get(item.component_id) ?? [];
        list.push(item);
        planItems.set(item.component_id, list);
      } else {
        sng.push(item);
      }
    }

    const lp: BuildPlan[] = [];
    for (const [cid, items] of planItems) {
      const comp = compMap.get(cid);
      if (comp) lp.push({ component: comp, items });
    }
    lp.sort((a, b) => b.items.length - a.items.length);
    return { livePlans: lp, liveSingles: sng };
  }, [allItems, initialPlans, ownerOverrides, assigneeOverrides]);

  // Filter by person — "all" shows everything (the visibility safety net so nothing is hidden).
  const isAll = person === 'all';
  const personPlans = isAll ? livePlans : livePlans.filter(p => p.component.owner === person);
  // All singles visible for this filter (still includes DONE — split out below).
  const personSingles = liveSingles.filter(i => {
    if (['cancelled', 'failed'].includes(i.status)) return false;
    if (isAll) return true;
    // Explicit assignee wins over the status heuristic (itemBelongsTo checks assignee first).
    return itemBelongsTo(i, person);
  });

  // FIX 1: a plan whose active (non-cancelled/failed) items are ALL done drops out of the
  // main "Build Progress" list into the collapsed "Completed" section at the bottom.
  const planIsComplete = (plan: BuildPlan) => {
    const active = plan.items.filter(i => !['cancelled', 'failed'].includes(i.status));
    return active.length > 0 && active.every(i => DONE_STATUSES.includes(i.status));
  };
  const activePlans = personPlans.filter(p => !planIsComplete(p));
  const completedPlans = personPlans.filter(planIsComplete);

  // FIX 1: DONE single items never appear in the active list — they go to Completed.
  const completedSingles = personSingles.filter(i => DONE_STATUSES.includes(i.status));
  const activeSingles = personSingles.filter(i => !DONE_STATUSES.includes(i.status));
  // Action singles are surfaced in the top bucket; the "Individual Items" list shows the rest.
  const nonActionSingles = activeSingles.filter(i => !isPersonAction(i, person));

  // FIX 2: the top "Needs your action" bucket — the SAME computation as the header count,
  // spanning plan items + singles for the current filter person. Honors explicit assignee.
  const actionItems = [...personPlans.flatMap(p => p.items), ...personSingles]
    .filter(i => isPersonAction(i, person));

  // Drill target
  const drillPlan = drillId ? personPlans.find(p => p.component.id === drillId) ?? null : null;

  // Activity counts across all person plans
  const allPersonItems = [...personPlans.flatMap(p => p.items), ...activeSingles];
  const bldCount = allPersonItems.filter(i => ['approved', 'executing'].includes(i.status)).length;
  const qaCount = allPersonItems.filter(i => i.status === 'qa').length;
  // Reconciled with the "Needs your action" section: same list, same count.
  const actCount = actionItems.length;

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

  // Per-item assignee reassignment handler (optimistic; rolls back on failure).
  const handleAssign = useCallback(async (itemId: string, assignee: string | null) => {
    setAssigneeOverrides(prev => ({ ...prev, [itemId]: assignee }));
    const result = await reassignItem(itemId, assignee);
    if (!result.ok) {
      setAssigneeOverrides(prev => {
        const next = { ...prev };
        delete next[itemId];
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
          {[
            { key: currentUser, label: 'Mine' },
            ...TEAM_MEMBERS.filter(m => m.key !== currentUser),
            { key: 'all', label: 'All' },
          ].map(opt => (
            <button key={opt.key} onClick={() => { setPerson(opt.key); setDrillId(null); }}
              className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                person === opt.key ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background)] text-[var(--muted-foreground)]'
              }`}>
              {opt.label}
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
            {actCount} waiting on {whoLabel}
          </span>
        )}
      </div>

      {/* ─── GRID VIEW ─── */}
      {!drillPlan && (
        <div>
          {/* ── NEEDS YOUR ACTION (top bucket, grouped by action) ── */}
          {actionItems.length > 0 && (
            <NeedsActionSection items={actionItems} onAssign={handleAssign} />
          )}

          {activePlans.map(plan => (
            <PlanCard key={plan.component.id} plan={plan} person={person} onDrill={() => setDrillId(plan.component.id)} />
          ))}

          {activePlans.length === 0 && actionItems.length === 0 && nonActionSingles.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[var(--border)] p-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No active build plans for {whoLabel}</p>
            </div>
          )}

          {nonActionSingles.length > 0 && (
            <>
              <div className="px-1 pb-1 pt-3 text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Individual Items ({nonActionSingles.length})
              </div>
              {nonActionSingles.map(item => (
                <SingleRow key={item.id} item={item} person={person} onAssign={handleAssign} />
              ))}
            </>
          )}

          {/* ── COMPLETED (collapsed, bottom) ── */}
          {(completedPlans.length + completedSingles.length) > 0 && (
            <CompletedSection
              plans={completedPlans}
              singles={completedSingles}
              person={person}
              onDrill={(id) => setDrillId(id)}
              onAssign={handleAssign}
            />
          )}
        </div>
      )}

      {/* ─── DRILL VIEW ─── */}
      {drillPlan && (
        <DrillView plan={drillPlan} person={person} onBack={() => setDrillId(null)} onReassign={handleReassign} onAssign={handleAssign} />
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
            item{s.acts > 1 ? 's' : ''} need action
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

/* ─── Per-item assignee picker (badge → menu) ─── */

function AssigneePicker({ item, onAssign }: {
  item: PipelineItem;
  onAssign: (itemId: string, assignee: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = item.assignee;
  const label = current ? (TEAM_MEMBERS.find(m => m.key === current)?.label ?? current) : 'Assign';

  // The picker lives inside clickable rows (Link / expand toggle) — swallow every click.
  const swallow = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div className="relative shrink-0" onClick={swallow}>
      <button
        onClick={(e) => { swallow(e); setOpen(o => !o); }}
        className={`flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold transition-colors hover:border-[var(--primary)] ${
          current
            ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
            : 'border-dashed border-[var(--border)] text-[var(--muted-foreground)]'
        }`}
      >
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[110px] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {TEAM_MEMBERS.map(m => (
            <button
              key={m.key}
              onClick={(e) => { swallow(e); if (m.key !== current) onAssign(item.id, m.key); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--muted)] ${
                m.key === current ? 'font-bold text-[var(--primary)]' : 'text-[var(--foreground)]'
              }`}
            >
              {m.key === current ? (
                <svg className="h-3 w-3 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : <span className="w-3" />}
              {m.label}
            </button>
          ))}
          <button
            onClick={(e) => { swallow(e); if (current) onAssign(item.id, null); setOpen(false); }}
            className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-1.5 text-left text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <span className="w-3" />
            Unassign
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Single item row ─── */

function SingleRow({ item, person, onAssign }: { item: PipelineItem; person: string; onAssign: (itemId: string, assignee: string | null) => void }) {
  const act = isAction(item.status, person);
  const sid = item.id.substring(0, 8).toUpperCase();
  const badge = statusBadge(item.status);
  const al = act ? actionLabel(item.status) : null;

  // A flex row (div) — the <Link> wraps ONLY the non-interactive content so the
  // AssigneePicker's <button> is never a descendant of the anchor (invalid HTML
  // that silently breaks App Router hydration and kills client navigation).
  return (
    <div
      className={`mb-0.5 flex items-center gap-1.5 rounded-[8px] border px-2.5 py-2 transition-colors active:border-[var(--primary)] ${
        act ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-[var(--border)] bg-[var(--card)]'
      }`}>
      <Link href={`/pipeline/${item.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</span>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold" style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
        <span className="text-[9px] text-[var(--muted-foreground)]">{waitTime(item.updated_at)}</span>
      </Link>
      <AssigneePicker item={item} onAssign={onAssign} />
      {al && (
        <span className="rounded-[5px] px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: al.bg }}>{al.text}</span>
      )}
    </div>
  );
}

/* ─── Needs-your-action bucket (top of grid, grouped by action) ─── */

function NeedsActionSection({ items, onAssign }: { items: PipelineItem[]; onAssign: (itemId: string, assignee: string | null) => void }) {
  // Group by the human-readable action label (Start design / Approve design / …).
  const groups = new Map<string, { al: { text: string; bg: string }; items: PipelineItem[] }>();
  for (const item of items) {
    const al = actionLabel(item.status);
    if (!al) continue;
    const g = groups.get(al.text) ?? { al, items: [] };
    g.items.push(item);
    groups.set(al.text, g);
  }
  const ordered = [
    ...ACTION_ORDER.filter(t => groups.has(t)).map(t => groups.get(t)!),
    ...[...groups.entries()].filter(([t]) => !ACTION_ORDER.includes(t)).map(([, g]) => g),
  ];

  return (
    <div className="mb-3 rounded-[12px] border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
          Needs your action ({items.length})
        </span>
      </div>
      {ordered.map(g => (
        <div key={g.al.text} className="mb-2 last:mb-0">
          <div className="mb-0.5 px-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: g.al.bg }}>
            {g.al.text} ({g.items.length})
          </div>
          {g.items.map(item => (
            <ActionRow key={item.id} item={item} al={g.al} onAssign={onAssign} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ActionRow({ item, al, onAssign }: { item: PipelineItem; al: { text: string; bg: string }; onAssign: (itemId: string, assignee: string | null) => void }) {
  const sid = item.id.substring(0, 8).toUpperCase();
  // Flex row (div); the <Link> wraps only non-interactive content so the
  // AssigneePicker <button> stays outside the anchor (see SingleRow note).
  return (
    <div className="mb-0.5 flex items-center gap-1.5 rounded-[8px] border border-red-200 bg-[var(--card)] px-2.5 py-2 transition-colors active:border-[var(--primary)] dark:border-red-900">
      <Link href={`/pipeline/${item.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</span>
        <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
      </Link>
      <AssigneePicker item={item} onAssign={onAssign} />
      <span className="shrink-0 rounded-[5px] px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: al.bg }}>{al.text}</span>
    </div>
  );
}

/* ─── Completed section (collapsed, bottom of grid) ─── */

function CompletedSection({ plans, singles, person, onDrill, onAssign }: {
  plans: BuildPlan[]; singles: PipelineItem[]; person: string; onDrill: (componentId: string) => void;
  onAssign: (itemId: string, assignee: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = plans.length + singles.length;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="mb-1 flex w-full items-center gap-1.5 px-1 py-1 text-left"
      >
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Completed ({count})
        </span>
        <svg className={`ml-auto h-3 w-3 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {open && (
        <div className="opacity-70">
          {plans.map(plan => (
            <PlanCard key={plan.component.id} plan={plan} person={person} onDrill={() => onDrill(plan.component.id)} />
          ))}
          {singles.map(item => (
            <SingleRow key={item.id} item={item} person={person} onAssign={onAssign} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Drill View ─── */

function DrillView({ plan, person, onBack, onReassign, onAssign }: { plan: BuildPlan; person: string; onBack: () => void; onReassign: (componentId: string, newOwner: string) => void; onAssign: (itemId: string, assignee: string | null) => void }) {
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
          onAssign={onAssign}
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
          onAssign={onAssign}
        />
      )}

      {/* ── QUEUED ── */}
      {queueItems.length > 0 && (
        <ItemSection
          label={`Queued (${queueItems.length})`}
          color="#94A3B8"
          items={queueItems}
          person={person}
          onAssign={onAssign}
        />
      )}

      {/* ── BLOCKED ── */}
      {blockedItems.length > 0 && (
        <ItemSection
          label={`Blocked (${blockedItems.length})`}
          color="#EF4444"
          items={blockedItems}
          person={person}
          onAssign={onAssign}
        />
      )}

      {/* ── OTHER ── */}
      {otherItems.length > 0 && (
        <ItemSection
          label={`Other (${otherItems.length})`}
          color="#94A3B8"
          items={otherItems}
          person={person}
          onAssign={onAssign}
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
          onAssign={onAssign}
        />
      )}
    </div>
  );
}

/* ─── Item Section (collapsible group in drill view) ─── */

function ItemSection({ label, color, pulse, items, person, subtitle, collapsed: defaultCollapsed, onAssign }: {
  label: string; color: string; pulse?: boolean;
  items: PipelineItem[]; person: string;
  subtitle?: string; collapsed?: boolean;
  onAssign: (itemId: string, assignee: string | null) => void;
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
        <DrillItem key={item.id} item={item} person={person} onAssign={onAssign} />
      ))}
    </div>
  );
}

/* ─── Drill Item (expandable with chevron) ─── */

function DrillItem({ item, person, onAssign }: { item: PipelineItem; person: string; onAssign: (itemId: string, assignee: string | null) => void }) {
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
        <AssigneePicker item={item} onAssign={onAssign} />
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
