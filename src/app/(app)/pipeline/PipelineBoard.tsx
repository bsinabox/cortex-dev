'use client';

import { useState, useMemo, useEffect, useRef, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type PipelineItem } from '@/components/ItemCard';
import {
  PRIORITY_CONFIG, REPO_CONFIG, PIPELINE_PHASES, getPhaseIndex, getPhaseForStatus,
  QUEUE_STATUSES, BLOCKED_STATUSES, DONE_STATUSES, waitTime,
} from '@/lib/constants';
import { approveItem } from './actions';

/* ─── Person filter logic ─── */

const SCOTT_ACTS_ON = new Set([
  'testing_in_dev', 'awaiting_hub_design', 'intake', 'designing',
  'cross_review', 'design_conflict', 'blocked', 'readiness_blocked',
  'waiting_on_dependency', 'decomposed',
]);
const BRIAN_ACTS_ON = new Set([
  'human_review', 'design_review_hold', 'promotion_review',
]);

function isActionFor(status: string, person: 'scott' | 'brian' | 'all'): boolean {
  if (person === 'all') return SCOTT_ACTS_ON.has(status) || BRIAN_ACTS_ON.has(status);
  if (person === 'scott') return SCOTT_ACTS_ON.has(status);
  return BRIAN_ACTS_ON.has(status);
}

function isWaitingOnOther(status: string, person: 'scott' | 'brian' | 'all'): boolean {
  if (person === 'all') return false;
  if (person === 'scott') return BRIAN_ACTS_ON.has(status);
  return SCOTT_ACTS_ON.has(status);
}

/* ─── Sort helpers ─── */

function sortGroup(a: PipelineItem, b: PipelineItem): number {
  // By phase index (furthest along first for action visibility)
  const phaseA = getPhaseIndex(a.status);
  const phaseB = getPhaseIndex(b.status);
  if (phaseA !== phaseB) return phaseB - phaseA;
  // Then priority
  const pOrder = ['p0', 'p1', 'p2', 'p3'];
  const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
  if (pDiff !== 0) return pDiff;
  // Then recency
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

/* ─── Action label for inline display ─── */

function getActionLabel(status: string): { text: string; color: string } | null {
  switch (status) {
    case 'human_review':       return { text: 'Ship', color: '#059669' };
    case 'design_review_hold': return { text: 'Ship', color: '#059669' };
    case 'testing_in_dev':     return { text: 'Test', color: '#0F766E' };
    case 'promotion_review':   return { text: 'Promote', color: '#7C3AED' };
    default: return null;
  }
}

/* ─── Status description ─── */

function getStatusHint(status: string): string {
  switch (status) {
    case 'human_review': return 'Approve or request changes';
    case 'testing_in_dev': return 'Verify on dev, then promote';
    case 'design_review_hold': return 'Review QA findings';
    case 'promotion_review': return 'Approve for production';
    case 'approved': return 'Worker assigned';
    case 'executing': return 'Building...';
    case 'qa': return 'Running QA';
    case 'designing': return 'Design in progress';
    case 'cross_review': return 'Codex reviewing';
    case 'design_conflict': return 'Needs resolution';
    case 'intake': return 'Needs design session';
    case 'awaiting_hub_design': return 'Start Hub chat';
    case 'promoting': return 'Deploying to prod';
    case 'waiting_migration': return 'Migrations running';
    case 'waiting_prod_evidence': return 'Collecting evidence';
    case 'blocked': return 'Manual intervention';
    case 'readiness_blocked': return 'Prerequisites missing';
    case 'waiting_on_dependency': return 'Blocked by dep';
    case 'decomposed': return 'Split into subtasks';
    case 'done': return 'Complete';
    case 'subtasks_complete': return 'Subtasks done';
    default: return status;
  }
}

/* ─── Component ─── */

interface PipelineBoardProps {
  initialItems: PipelineItem[];
}

const PULL_THRESHOLD = 80;

export function PipelineBoard({ initialItems }: PipelineBoardProps) {
  const { data: items, refresh } = useRealtimeTable<PipelineItem>(
    'agentic_items',
    initialItems
  );

  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<'scott' | 'brian' | 'all'>('scott');
  const [showDone, setShowDone] = useState(false);

  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);

  // Sticky repo filter
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cortex-repo-filter');
      if (saved && ['all', 'kertec-field-app-v2', 'bs-box-web', 'cortex-dev'].includes(saved)) {
        setRepoFilter(saved);
      }
    } catch { /* */ }
  }, []);

  const handleRepoChange = (value: string) => {
    setRepoFilter(value);
    try { localStorage.setItem('cortex-repo-filter', value); } catch { /* */ }
  };

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing || window.scrollY > 0) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) setPullDistance(Math.min(diff * 0.5, PULL_THRESHOLD + 20));
  }, [refreshing]);
  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      await refresh();
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, refreshing, refresh]);

  // Filter by repo
  const filtered = useMemo(() => {
    let list = items.filter(i => !['cancelled', 'failed'].includes(i.status));
    if (repoFilter !== 'all') list = list.filter(i => i.repo === repoFilter);
    return list;
  }, [items, repoFilter]);

  // Phase counts for summary bar
  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of PIPELINE_PHASES) counts[p.key] = 0;
    counts['queue'] = 0;
    counts['blocked'] = 0;
    counts['done'] = 0;
    for (const item of filtered) {
      if (QUEUE_STATUSES.includes(item.status)) { counts['queue']++; continue; }
      if (BLOCKED_STATUSES.includes(item.status)) { counts['blocked']++; continue; }
      if (DONE_STATUSES.includes(item.status)) { counts['done']++; continue; }
      const phase = getPhaseForStatus(item.status);
      if (phase) counts[phase.key]++;
    }
    return counts;
  }, [filtered]);

  // Sort into groups
  const { actionItems, waitingItems, autonomousItems, blockedItems, queueItems, doneItems } = useMemo(() => {
    const action: PipelineItem[] = [];
    const waiting: PipelineItem[] = [];
    const autonomous: PipelineItem[] = [];
    const blocked: PipelineItem[] = [];
    const queue: PipelineItem[] = [];
    const done: PipelineItem[] = [];

    for (const item of filtered) {
      if (DONE_STATUSES.includes(item.status)) { done.push(item); continue; }
      if (QUEUE_STATUSES.includes(item.status)) { queue.push(item); continue; }
      if (BLOCKED_STATUSES.includes(item.status)) { blocked.push(item); continue; }

      if (isActionFor(item.status, personFilter)) {
        action.push(item);
      } else if (isWaitingOnOther(item.status, personFilter)) {
        waiting.push(item);
      } else {
        autonomous.push(item);
      }
    }

    action.sort(sortGroup);
    waiting.sort(sortGroup);
    autonomous.sort(sortGroup);
    blocked.sort(sortGroup);
    queue.sort((a, b) => {
      const pOrder = ['p0', 'p1', 'p2', 'p3'];
      const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
      if (pDiff !== 0) return pDiff;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    done.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return { actionItems: action, waitingItems: waiting, autonomousItems: autonomous, blockedItems: blocked, queueItems: queue, doneItems: done };
  }, [filtered, personFilter]);

  const totalActive = filtered.length - doneItems.length;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh */}
      {(pullDistance > 0 || refreshing) && (
        <div className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
          style={{ height: refreshing ? 40 : pullDistance > 0 ? pullDistance : 0 }}>
          <span className={`text-xs text-[var(--muted-foreground)] ${refreshing ? 'animate-pulse' : ''}`}>
            {refreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex rounded-[8px] border border-[var(--border)] overflow-hidden">
          {(['scott', 'brian', 'all'] as const).map((p) => (
            <button key={p} onClick={() => setPersonFilter(p)}
              className={`px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                personFilter === p
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)]'
              }`}>
              {p === 'all' ? 'All' : p === 'scott' ? 'Mine' : 'Brian'}
            </button>
          ))}
        </div>

        <select
          value={repoFilter}
          onChange={(e) => handleRepoChange(e.target.value)}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
        >
          <option value="all">All repos</option>
          <option value="kertec-field-app-v2">KerTec</option>
          <option value="bs-box-web">BS Box</option>
          <option value="cortex-dev">Cortex</option>
        </select>

        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          {actionItems.length > 0 && (
            <span className="mr-1.5 font-semibold text-red-500">{actionItems.length} action</span>
          )}
          {totalActive} active
        </span>
      </div>

      {/* Phase summary bar */}
      <div className="mb-3 flex flex-wrap gap-x-2 gap-y-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5">
        {PIPELINE_PHASES.map((phase) => (
          <span key={phase.key} className="flex items-center gap-1 text-[10px]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: phase.dot }} />
            <span style={{ color: phase.text }} className="font-medium">{phase.short}</span>
            <span className="text-[var(--muted-foreground)]">{phaseCounts[phase.key] || 0}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)]" style={{ opacity: 0.4 }} />
          <span className="text-[var(--muted-foreground)]">Q {phaseCounts['queue'] || 0}</span>
        </span>
        {(phaseCounts['blocked'] || 0) > 0 && (
          <span className="flex items-center gap-1 text-[10px]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#EF4444' }} />
            <span className="text-red-500">Blk {phaseCounts['blocked']}</span>
          </span>
        )}
      </div>

      {/* ─── Status Board rows ─── */}
      <div className="space-y-0.5">

        {/* ACTION NEEDED */}
        {actionItems.length > 0 && (
          <>
            <SectionLabel label="Action needed" count={actionItems.length} accent="#991B1B" />
            {actionItems.map((item) => (
              <BoardRow key={item.id} item={item} isAction />
            ))}
          </>
        )}

        {/* WAITING ON OTHER */}
        {waitingItems.length > 0 && (
          <>
            <SectionLabel
              label={personFilter === 'scott' ? 'Waiting on Brian' : personFilter === 'brian' ? 'Waiting on Scott' : ''}
              count={waitingItems.length}
              accent="#92400E"
            />
            {waitingItems.map((item) => (
              <BoardRow key={item.id} item={item} />
            ))}
          </>
        )}

        {/* AUTONOMOUS — with scorecard */}
        {autonomousItems.length > 0 && (
          <>
            <SectionLabel label="Autonomous" count={autonomousItems.length} accent="#1E40AF" />
            <AutonomousScorecard items={autonomousItems} />
            {autonomousItems.map((item) => (
              <BoardRow key={item.id} item={item} showRound />
            ))}
          </>
        )}

        {/* BLOCKED */}
        {blockedItems.length > 0 && (
          <>
            <SectionLabel label="Blocked" count={blockedItems.length} accent="#DC2626" />
            {blockedItems.map((item) => (
              <BoardRow key={item.id} item={item} />
            ))}
          </>
        )}

        {/* QUEUE */}
        {queueItems.length > 0 && (
          <>
            <SectionLabel label="Queue" count={queueItems.length} accent="var(--muted-foreground)" />
            {queueItems.map((item) => (
              <BoardRow key={item.id} item={item} dimmed />
            ))}
          </>
        )}

        {/* DONE */}
        {doneItems.length > 0 && (
          <button onClick={() => setShowDone(!showDone)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1 text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <svg className={`h-2.5 w-2.5 transition-transform ${showDone ? 'rotate-90' : ''}`}
              fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            Done ({doneItems.length})
          </button>
        )}
        {showDone && doneItems.map((item) => (
          <BoardRow key={item.id} item={item} dimmed />
        ))}

        {filtered.length === 0 && (
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">No items match current filter</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Lightweight section divider ─── */

function SectionLabel({ label, count, accent }: { label: string; count: number; accent: string }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-2 first:pt-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </span>
      <span className="flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: accent }}>
        {count}
      </span>
    </div>
  );
}

/* ─── Autonomous scorecard — sub-status + round breakdown ─── */

function AutonomousScorecard({ items }: { items: PipelineItem[] }) {
  const approved = items.filter(i => i.status === 'approved').length;
  const executing = items.filter(i => i.status === 'executing').length;
  const qa = items.filter(i => i.status === 'qa').length;

  // Round distribution
  const rounds: Record<number, number> = {};
  for (const item of items) {
    const r = item.current_round ?? 0;
    rounds[r] = (rounds[r] || 0) + 1;
  }
  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  return (
    <div className="mb-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] border border-blue-200 bg-blue-50 px-2.5 py-1.5 dark:border-blue-800 dark:bg-blue-950/30">
      {/* Sub-status pills */}
      <div className="flex items-center gap-2 text-[10px]">
        {approved > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-blue-700 dark:text-blue-300">{approved} queued</span>
          </span>
        )}
        {executing > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-700 dark:text-emerald-300">{executing} building</span>
          </span>
        )}
        {qa > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-teal-400" />
            <span className="text-teal-700 dark:text-teal-300">{qa} QA</span>
          </span>
        )}
      </div>
      {/* Round distribution */}
      <div className="flex items-center gap-1.5 text-[9px] text-[var(--muted-foreground)]">
        {roundKeys.map(r => (
          <span key={r} className={`rounded-[3px] px-1 py-0.5 ${
            r >= 3 ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300'
              : r >= 2 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300'
              : 'bg-[var(--muted)]'
          }`}>
            R{r}:{rounds[r]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Dense board row — 2 lines per item ─── */

function BoardRow({ item, isAction, dimmed, showRound }: { item: PipelineItem; isAction?: boolean; dimmed?: boolean; showRound?: boolean }) {
  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const phase = getPhaseForStatus(item.status);
  const actionLabel = isAction ? getActionLabel(item.status) : null;
  const hint = getStatusHint(item.status);
  const round = item.current_round ?? 0;

  return (
    <div className={`rounded-[8px] border px-2.5 py-1.5 transition-colors ${
      isAction
        ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
        : 'border-[var(--border)] bg-[var(--card)]'
    } ${dimmed ? 'opacity-60' : ''}`}>
      {/* Line 1: SID · Phase · Priority · Repo · Wait · Action */}
      <div className="flex items-center gap-1.5">
        <Link href={`/pipeline/${item.id}`}
          className="font-mono text-[11px] font-bold text-[var(--primary)] active:underline">
          {sid}
        </Link>

        {phase && (
          <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-semibold"
            style={{ background: phase.bg, color: phase.text }}>
            {phase.short}
          </span>
        )}

        {!phase && QUEUE_STATUSES.includes(item.status) && (
          <span className="rounded-[4px] bg-[var(--muted)] px-1 py-0.5 text-[8px] text-[var(--muted-foreground)]">
            Queue
          </span>
        )}

        {!phase && BLOCKED_STATUSES.includes(item.status) && (
          <span className="rounded-[4px] bg-red-100 px-1 py-0.5 text-[8px] text-red-700 dark:bg-red-900 dark:text-red-300">
            Blk
          </span>
        )}

        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold"
          style={{ background: priority.bg, color: priority.text }}>
          {priority.label}
        </span>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px]"
          style={{ background: repo.bg, color: repo.text }}>
          {repo.label}
        </span>

        {showRound && round > 0 && (
          <span className={`rounded-[4px] px-1 py-0.5 text-[8px] font-bold ${
            round >= 3
              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              : round >= 2
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
          }`}>
            R{round}
          </span>
        )}

        {item.escalated_at && (
          <span className="text-[10px] text-amber-500" title={item.escalation_reason ?? 'Escalated'}>&#9888;</span>
        )}

        <span className="ml-auto text-[9px] text-[var(--muted-foreground)]">
          {waitTime(item.updated_at)}
        </span>

        {actionLabel && (
          <InlineApproveButton itemId={item.id} label={actionLabel.text} color={actionLabel.color} />
        )}
      </div>

      {/* Line 2: Title + status hint */}
      <div className="mt-0.5 flex items-baseline gap-2">
        <Link href={`/pipeline/${item.id}`}
          className="min-w-0 flex-1 truncate text-[11px] leading-snug text-[var(--foreground)] active:underline">
          {item.title}
        </Link>
        <span className="shrink-0 text-[9px] text-[var(--muted-foreground)]">{hint}</span>
      </div>
    </div>
  );
}

/* ─── Inline approve button ─── */

function InlineApproveButton({ itemId, label, color }: { itemId: string; label: string; color: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<'idle' | 'ok' | 'err'>('idle');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const res = await approveItem(itemId);
      setResult(res.ok ? 'ok' : 'err');
      setTimeout(() => setResult('idle'), 2000);
    });
  };

  if (result === 'ok') {
    return (
      <span className="shrink-0 rounded-[5px] border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        &#10003;
      </span>
    );
  }

  if (result === 'err') {
    return (
      <span className="shrink-0 rounded-[5px] border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
        &#10007;
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-50"
      style={{ background: color, borderColor: color }}
    >
      {pending ? '\u2026' : label}
    </button>
  );
}
