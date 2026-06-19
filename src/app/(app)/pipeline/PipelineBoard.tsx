'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { type PipelineItem } from '@/components/ItemCard';
import { PRIORITY_CONFIG, REPO_CONFIG, STATUS_LABELS, timeAgo } from '@/lib/constants';
// Inline mini copy button — no external dependency

/* ─── Person filter — who is the next actor ─── */

const SCOTT_ACTS_ON = new Set([
  'testing_in_dev', 'awaiting_hub_design', 'intake', 'designing',
  'cross_review', 'design_conflict', 'blocked', 'readiness_blocked',
  'waiting_on_dependency', 'decomposed',
]);
const BRIAN_ACTS_ON = new Set([
  'human_review', 'design_review_hold', 'promotion_review',
]);
// Autonomous + done statuses shown for everyone
const SHARED_STATUSES = new Set([
  'approved', 'executing', 'qa', 'promoting',
  'waiting_migration', 'waiting_prod_evidence',
  'done', 'subtasks_complete',
]);

/* ─── Section definitions ─── */

type SectionDef = {
  key: string;
  label: string;
  description: string;
  icon: string;
  accentBg: string;
  accentText: string;
  statuses: string[];
  defaultOpen: boolean;
};

const SECTIONS: SectionDef[] = [
  {
    key: 'action',
    label: 'Action needed',
    description: 'You need to review, test, or approve these items to keep them moving.',
    icon: '!',
    accentBg: '#FEE2E2',
    accentText: '#991B1B',
    statuses: ['human_review', 'testing_in_dev', 'design_review_hold', 'promotion_review'],
    defaultOpen: true,
  },
  {
    key: 'autonomous',
    label: 'Autonomous',
    description: 'Conductor is actively building or reviewing. No action needed — monitor only.',
    icon: '\u2699',
    accentBg: '#DBEAFE',
    accentText: '#1E40AF',
    statuses: ['approved', 'executing', 'qa'],
    defaultOpen: true,
  },
  {
    key: 'design',
    label: 'In design',
    description: 'Being designed in Hub conversations. Open a chat to continue.',
    icon: '\u270F',
    accentBg: '#EDE9FE',
    accentText: '#6D28D9',
    statuses: ['designing', 'cross_review', 'design_conflict'],
    defaultOpen: true,
  },
  {
    key: 'queue',
    label: 'Queue',
    description: 'Waiting for a Hub design session to get started. Prioritized by P-level.',
    icon: '\u2630',
    accentBg: 'var(--color-stone-100)',
    accentText: 'var(--color-stone-600)',
    statuses: ['intake', 'awaiting_hub_design'],
    defaultOpen: false,
  },
  {
    key: 'promoting',
    label: 'Promoting',
    description: 'Verified and moving through the promotion pipeline to production.',
    icon: '\u2191',
    accentBg: '#F3E8FF',
    accentText: '#7C3AED',
    statuses: ['promoting', 'waiting_migration', 'waiting_prod_evidence'],
    defaultOpen: true,
  },
  {
    key: 'blocked',
    label: 'Blocked',
    description: 'Stuck — needs manual intervention or a dependency resolved.',
    icon: '\u26A0',
    accentBg: '#FEF3C7',
    accentText: '#92400E',
    statuses: ['blocked', 'readiness_blocked', 'waiting_on_dependency', 'decomposed'],
    defaultOpen: true,
  },
  {
    key: 'done',
    label: 'Done',
    description: 'Completed and deployed. No further action.',
    icon: '\u2713',
    accentBg: '#D1FAE5',
    accentText: '#065F46',
    statuses: ['done', 'subtasks_complete'],
    defaultOpen: false,
  },
];

/* ─── Action summaries ─── */

function getActionLine(status: string): string {
  switch (status) {
    case 'human_review': return 'Approve design or request changes';
    case 'testing_in_dev': return 'Verify changes on dev, then promote';
    case 'design_review_hold': return 'Review QA escalation findings';
    case 'promotion_review': return 'Approve production deploy';
    case 'approved': return 'Worker assigned, build starting';
    case 'executing': return 'Worker actively writing code';
    case 'qa': return 'Build complete, running QA checks';
    case 'designing': return 'Claude drafting solution design';
    case 'cross_review': return 'Codex reviewing Claude design';
    case 'design_conflict': return 'Design conflict — needs resolution';
    case 'intake': return 'Waiting for design session';
    case 'awaiting_hub_design': return 'Start Hub chat to begin design';
    case 'promoting': return 'Deploying to production';
    case 'waiting_migration': return 'Running migrations';
    case 'waiting_prod_evidence': return 'Collecting deploy evidence';
    case 'blocked': return 'Manual intervention needed';
    case 'readiness_blocked': return 'Prerequisites missing';
    case 'waiting_on_dependency': return 'Waiting on another item';
    case 'decomposed': return 'Split into subtasks';
    case 'done': return 'Deployed and verified';
    case 'subtasks_complete': return 'All subtasks finished';
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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const s of SECTIONS) {
      if (!s.defaultOpen) set.add(s.key);
    }
    return set;
  });

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

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  // Pull-to-refresh
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

  // Filter items by repo and person
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (repoFilter !== 'all' && i.repo !== repoFilter) return false;
      if (personFilter === 'scott') {
        return SCOTT_ACTS_ON.has(i.status) || SHARED_STATUSES.has(i.status);
      }
      if (personFilter === 'brian') {
        return BRIAN_ACTS_ON.has(i.status) || SHARED_STATUSES.has(i.status);
      }
      return true;
    });
  }, [items, repoFilter, personFilter]);

  // Build sections
  const sectionData = useMemo(() => {
    return SECTIONS.map((sec) => {
      const sectionItems = filtered
        .filter((item) => sec.statuses.includes(item.status))
        .sort((a, b) => {
          // Priority first for queue, recency first for everything else
          if (sec.key === 'queue') {
            const pOrder = ['p0', 'p1', 'p2', 'p3'];
            const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
            if (pDiff !== 0) return pDiff;
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      return { ...sec, items: sectionItems };
    }).filter((sec) => sec.items.length > 0);
  }, [filtered]);

  const actionCount = sectionData.find(s => s.key === 'action')?.items.length ?? 0;
  const totalActive = sectionData.reduce((sum, s) => s.key !== 'done' ? sum + s.items.length : sum, 0);

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
      <div className="mb-3 flex items-center gap-1.5">
        {/* Person toggle */}
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
          {actionCount > 0 && (
            <span className="mr-2 font-semibold text-red-500">{actionCount} action</span>
          )}
          {totalActive} active
        </span>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sectionData.map((sec) => {
          const isCollapsed = collapsed.has(sec.key);
          return (
            <div key={sec.key} className="rounded-[10px] border border-[var(--border)] bg-[var(--muted)]">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sec.key)}
                className="flex w-full items-center gap-2 rounded-t-[10px] px-3 py-2"
                style={{ background: sec.accentBg }}
              >
                <svg className={`h-3 w-3 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  style={{ color: sec.accentText }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: sec.accentText }}>
                  {sec.icon} {sec.label}
                </span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: sec.accentText, color: sec.accentBg }}>
                  {sec.items.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="p-1.5">
                  <p className="mb-1.5 px-1.5 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
                    {sec.description}
                  </p>
                  <div className="space-y-1">
                    {sec.items.map((item) => (
                      <CompactItemCard key={item.id} item={item} showAction={sec.key === 'action'} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sectionData.length === 0 && (
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">No items match current filter</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Compact item card with action line ─── */

function CompactItemCard({ item, showAction }: { item: PipelineItem; showAction: boolean }) {
  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;
  const actionLine = getActionLine(item.status);

  const bootPrompt = `Boot up conductor item ${sid}.\n\nSteps:\n1. Run mandatory timestamp.\n2. Query live state from Supabase (project ftpbxlizcsbzvmtbtuef):\n   - Item: SELECT * FROM agentic_items WHERE UPPER(LEFT(id::text, 8)) = '${sid}'\n   - Messages, revisions, jobs, workers for item_id = '${item.id}'\n3. Repo is ${item.repo} — read relevant source from VPS.\n4. Report full context and recommend next action.\n\nBegin.`;

  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-2.5">
      {/* Row 1: SID + priority + repo + time */}
      <div className="flex items-center gap-1.5">
        <Link href={`/pipeline/${item.id}`} className="font-mono text-[11px] font-bold text-[var(--primary)] active:underline">
          {sid}
        </Link>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-bold"
          style={{ background: priority.bg, color: priority.text }}>
          {priority.label}
        </span>
        <span className="rounded-[4px] px-1 py-0.5 text-[8px] font-medium"
          style={{ background: repo.bg, color: repo.text }}>
          {repo.label}
        </span>
        {item.escalated_at && (
          <span className="text-[10px] text-amber-500" title={item.escalation_reason ?? 'Escalated'}>&#9888;</span>
        )}
        <span className="ml-auto text-[9px] text-[var(--muted-foreground)]">
          {timeAgo(item.updated_at)}
        </span>
      </div>

      {/* Row 2: Title */}
      <p className="mt-1 line-clamp-1 text-[12px] leading-snug text-[var(--foreground)]">
        {item.title}
      </p>

      {/* Row 3: Action line + boot button */}
      <div className="mt-1 flex items-center gap-2">
        <span className={`flex-1 text-[10px] ${showAction ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--muted-foreground)]'}`}>
          {showAction ? '\u2794 ' : ''}{actionLine}
        </span>
        <MiniCopyButton text={bootPrompt} />
      </div>
    </div>
  );
}

/* ─── Mini copy button ─── */

function MiniCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button onClick={handleCopy}
      className={`shrink-0 rounded-[6px] border px-2 py-0.5 text-[9px] font-medium transition-colors ${
        copied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'border-[var(--border)] text-[var(--muted-foreground)] active:bg-[var(--muted)]'
      }`}>
      {copied ? '\u2713 Copied' : 'Boot'}
    </button>
  );
}
