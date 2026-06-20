'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type PipelineItem } from '@/components/ItemCard';
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
  const through = bld + qa + done;
  const pct = t > 0 ? Math.round((through / t) * 100) : 0;
  const minHours = items.length > 0
    ? Math.min(...items.map(i => (Date.now() - new Date(i.updated_at).getTime()) / 3600000))
    : 999;
  return { t, bld, qa, rev, des, blk, done, acts, through, pct, minHours };
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
    design_review_hold: 'Review QA findings', approved: 'Queued for worker',
    executing: 'Building...', qa: 'Running QA', cross_review: 'Codex reviewing',
    designing: 'Design in progress', readiness_blocked: 'Waiting on dependencies',
    blocked: 'Needs intervention', awaiting_hub_design: 'Needs design session',
  };
  return hints[status] ?? status;
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
    for (const p of initialPlans) compMap.set(p.component.id, p.component);

    const planItems = new Map<string, PipelineItem[]>();
    const sng: PipelineItem[] = [];

    for (const item of allItems) {
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
  }, [allItems, initialPlans]);

  // Filter by person
  const personPlans = livePlans.filter(p => p.component.owner === person);
  const personSingles = liveSingles.filter(i => {
    if (['cancelled', 'failed'].includes(i.status)) return false;
    return isAction(i.status, person) ||
      (!SCOTT_ACTS.has(i.status) && !BRIAN_ACTS.has(i.status) && person === 'scott');
  });

  // Drill target
  const drillPlan = drillId ? personPlans.find(p => p.component.id === drillId) ?? null : null;

  // Activity counts across all person plans
  const allPersonItems = [...personPlans.flatMap(p => p.items), ...personSingles];
  const bldCount = allPersonItems.filter(i => ['approved', 'executing'].includes(i.status)).length;
  const qaCount = allPersonItems.filter(i => i.status === 'qa').length;
  const actCount = allPersonItems.filter(i => isAction(i.status, person)).length;

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

      {/* ─── GRID VIEW ─── */}
      {!drillPlan && (
        <div>
          {/* Build plan cards */}
          {personPlans.map(plan => (
            <PlanCard key={plan.component.id} plan={plan} person={person} onDrill={() => setDrillId(plan.component.id)} />
          ))}

          {personPlans.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[var(--border)] p-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No active build plans for {person === 'scott' ? 'you' : 'Brian'}</p>
            </div>
          )}

          {/* Individual items */}
          {personSingles.length > 0 && (
            <>
              <div className="px-1 pb-1 pt-3 text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Individual Items ({personSingles.length})
              </div>
              {personSingles.map(item => (
                <SingleRow key={item.id} item={item} person={person} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── DRILL VIEW ─── */}
      {drillPlan && (
        <DrillView plan={drillPlan} person={person} onBack={() => setDrillId(null)} />
      )}
    </div>
  );
}

/* ─── Build Plan Card (Mission Control style) ─── */

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

  return (
    <div
      onClick={onDrill}
      className={`mb-2 cursor-pointer rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 transition-colors active:border-[var(--primary)] ${idle ? 'opacity-40' : ''}`}
    >
      <div className="text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--muted-foreground)]">Build Progress</div>

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

      {s.acts > 0 && (
        <div className="mt-1.5 flex items-center gap-2 rounded-[6px] border border-red-200 bg-red-50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/30">
          <span className="text-[14px] font-extrabold text-red-500">{s.acts}</span>
          <span className="text-[10px] text-red-400">
            item{s.acts > 1 ? 's' : ''} waiting on {person === 'scott' ? 'you' : 'Brian'}
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
  const phase = getPhaseForStatus(item.status);
  const phLabel = phase?.short ?? (QUEUE_STATUSES.includes(item.status) ? 'Q' : BLOCKED_STATUSES.includes(item.status) ? 'Blk' : '?');
  const al = act ? actionLabel(item.status) : null;

  return (
    <Link href={`/pipeline/${item.id}`}
      className={`mb-0.5 flex items-center gap-1.5 rounded-[8px] border px-2.5 py-2 transition-colors active:border-[var(--primary)] ${
        act ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-[var(--border)] bg-[var(--card)]'
      }`}>
      <span className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</span>
      <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold" style={{ background: phase?.bg ?? 'var(--muted)', color: phase?.text ?? 'var(--muted-foreground)' }}>{phLabel}</span>
      <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
      <span className="text-[9px] text-[var(--muted-foreground)]">{waitTime(item.updated_at)}</span>
      {al && (
        <span className="rounded-[5px] px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: al.bg }}>{al.text}</span>
      )}
    </Link>
  );
}

/* ─── Drill View ─── */

function DrillView({ plan, person, onBack }: { plan: BuildPlan; person: string; onBack: () => void }) {
  const s = calcPlan(plan.items, person);

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

  // Sort: action first, then by phase desc
  const sorted = [...plan.items]
    .filter(i => !['cancelled', 'failed'].includes(i.status))
    .sort((a, b) => {
      const aA = isAction(a.status, person) ? 0 : 1;
      const bA = isAction(b.status, person) ? 0 : 1;
      if (aA !== bA) return aA - bA;
      return getPhaseIndex(b.status) - getPhaseIndex(a.status);
    });

  return (
    <div>
      <button onClick={onBack} className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
        <span>&#8592;</span> All plans
      </button>

      <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-[18px] font-bold">{plan.component.name}</div>
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

      {sorted.map(item => (
        <DrillItem key={item.id} item={item} person={person} />
      ))}
    </div>
  );
}

/* ─── Drill Item (expandable with chevron) ─── */

function DrillItem({ item, person }: { item: PipelineItem; person: string }) {
  const [expanded, setExpanded] = useState(false);
  const act = isAction(item.status, person);
  const sid = item.id.substring(0, 8).toUpperCase();
  const phase = getPhaseForStatus(item.status);
  const phLabel = phase?.short ?? (QUEUE_STATUSES.includes(item.status) ? 'Q' : BLOCKED_STATUSES.includes(item.status) ? 'Blk' : '?');
  const al = act ? actionLabel(item.status) : null;
  const round = item.current_round ?? 0;

  // Chevron data
  const phases = getPhasesForPolicy(item.execution_policy);
  const currentIdx = getPhaseIndex(item.status);
  const isBlocked = BLOCKED_STATUSES.includes(item.status);
  const isQueue = QUEUE_STATUSES.includes(item.status);

  return (
    <div className={`mb-1 overflow-hidden rounded-[8px] border ${act ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40' : 'border-[var(--border)] bg-[var(--card)]'}`}>
      <div className="flex cursor-pointer items-center gap-1.5 px-2.5 py-2 active:bg-[var(--muted)]" onClick={() => setExpanded(!expanded)}>
        <Link href={`/pipeline/${item.id}`} onClick={e => e.stopPropagation()}
          className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</Link>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold" style={{ background: phase?.bg ?? 'var(--muted)', color: phase?.text ?? 'var(--muted-foreground)' }}>{phLabel}</span>
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
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] px-2.5 py-2">
          <p className="mb-2 text-[10px] text-[var(--muted-foreground)]">{statusHint(item.status)}</p>
          {/* Chevron */}
          <div className="flex gap-0.5">
            {phases.map((ph) => {
              const gIdx = PIPELINE_PHASES.findIndex(p => p.key === ph.key);
              let color = 'var(--muted)';
              if (!isBlocked && !isQueue) {
                if (gIdx < currentIdx) color = ph.dot;
                else if (gIdx === currentIdx) color = ph.dot;
              }
              return (
                <div key={ph.key} className="h-[5px] flex-1 rounded-full" style={{
                  background: color,
                  opacity: gIdx === currentIdx ? 1 : gIdx < currentIdx ? 0.8 : 0.2,
                  animation: gIdx === currentIdx && !isBlocked && !isQueue ? 'pulse 2s ease-in-out infinite' : undefined,
                }} />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[7px] text-[var(--muted-foreground)]">
            {phases.map((ph) => {
              const gIdx = PIPELINE_PHASES.findIndex(p => p.key === ph.key);
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
