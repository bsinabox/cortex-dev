'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { ItemCard, type PipelineItem } from '@/components/ItemCard';
import { PIPELINE_COLUMNS, HUMAN_GATE_STATUSES } from '@/lib/constants';

interface PipelineBoardProps {
  initialItems: PipelineItem[];
}

const TERMINAL_STATUSES = ['done', 'subtasks_complete'];
const RECENCY_MS = 72 * 60 * 60 * 1000;
const PULL_THRESHOLD = 80;

export function PipelineBoard({ initialItems }: PipelineBoardProps) {
  const { data: items, refresh } = useRealtimeTable<PipelineItem>(
    'agentic_items',
    initialItems
  );

  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [myAttention, setMyAttention] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);

  // Collapsed status sections (mobile list view)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

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

  // Batch progress across ALL items
  const batchProgress = useMemo(() => {
    const progress: Record<string, { total: number; done: number }> = {};
    for (const item of items) {
      if (!item.batch_id) continue;
      if (!progress[item.batch_id]) progress[item.batch_id] = { total: 0, done: 0 };
      progress[item.batch_id].total++;
      if (item.status === 'done' || item.status === 'subtasks_complete') {
        progress[item.batch_id].done++;
      }
    }
    return progress;
  }, [items]);

  const filteredItems = useMemo(() => {
    const now = Date.now();
    return items.filter((item) => {
      if (repoFilter !== 'all' && item.repo !== repoFilter) return false;
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (myAttention && !HUMAN_GATE_STATUSES.includes(item.status as typeof HUMAN_GATE_STATUSES[number])) return false;
      if (activeOnly) {
        if (TERMINAL_STATUSES.includes(item.status)) return false;
        if (now - new Date(item.updated_at).getTime() > RECENCY_MS) return false;
      }
      return true;
    });
  }, [items, repoFilter, priorityFilter, myAttention, activeOnly]);

  // Column data with batch grouping
  const columnData = useMemo(() => {
    return PIPELINE_COLUMNS.map((col) => {
      const colItems = filteredItems
        .filter((item) => col.statuses.includes(item.status))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const batched: Record<string, PipelineItem[]> = {};
      const unbatched: PipelineItem[] = [];

      for (const item of colItems) {
        if (item.batch_id) {
          if (!batched[item.batch_id]) batched[item.batch_id] = [];
          batched[item.batch_id].push(item);
        } else {
          unbatched.push(item);
        }
      }

      return { ...col, items: colItems, batched, unbatched };
    });
  }, [filteredItems]);

  const totalCount = filteredItems.length;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
          style={{ height: refreshing ? 40 : pullDistance > 0 ? pullDistance : 0 }}
        >
          <span className={`text-xs text-[var(--muted-foreground)] ${refreshing ? 'animate-pulse' : ''}`}>
            {refreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* Compact filters */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 lg:gap-2 lg:pb-0">
        <button
          onClick={() => setActiveOnly((v) => !v)}
          className={`shrink-0 rounded-[8px] border px-2.5 py-1 text-xs font-medium transition-colors lg:px-3 lg:py-1.5 lg:text-sm ${
            activeOnly
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
              : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]'
          }`}
        >
          Active now
        </button>

        <select
          value={repoFilter}
          onChange={(e) => handleRepoChange(e.target.value)}
          className="shrink-0 rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs lg:px-3 lg:py-1.5 lg:text-sm"
        >
          <option value="all">All repos</option>
          <option value="kertec-field-app-v2">KerTec</option>
          <option value="bs-box-web">BS Box</option>
          <option value="cortex-dev">Cortex</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="shrink-0 rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs lg:px-3 lg:py-1.5 lg:text-sm"
        >
          <option value="all">All priorities</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </select>

        <button
          onClick={() => setMyAttention((v) => !v)}
          className={`shrink-0 rounded-[8px] border px-2.5 py-1 text-xs transition-colors lg:px-3 lg:py-1.5 lg:text-sm ${
            myAttention
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]'
          }`}
        >
          My attention
        </button>

        <span className="ml-auto shrink-0 text-[11px] text-[var(--muted-foreground)] lg:text-xs">
          {totalCount} items
        </span>
      </div>

      {/* ─── MOBILE: Vertical list view ─── */}
      <div className="space-y-2 lg:hidden">
        {columnData.map((col) => {
          if (col.collapsed && col.items.length === 0) return null;
          if (col.items.length === 0) return null;

          const isCollapsed = collapsedSections.has(col.key);
          const batchIds = Object.keys(col.batched);

          return (
            <div key={col.key} className="rounded-[10px] border border-[var(--border)] bg-[var(--muted)]">
              {/* Status header — tappable to collapse */}
              <button
                onClick={() => toggleSection(col.key)}
                className="flex w-full items-center justify-between rounded-t-[10px] px-3 py-2"
                style={{ background: col.bgClass }}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    style={{ color: col.textClass }}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: col.textClass }}
                  >
                    {col.label}
                  </span>
                </div>
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: col.textClass, color: col.bgClass }}
                >
                  {col.items.length}
                </span>
              </button>

              {/* Description + Items */}
              {!isCollapsed && (
                <div className="p-1.5">
                  <p className="mb-1.5 px-1.5 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
                    {col.description}
                  </p>
                  <div className="space-y-1.5">
                  {batchIds.map((batchId) => (
                    <BatchGroup
                      key={batchId}
                      batchId={batchId}
                      items={col.batched[batchId]}
                      progress={batchProgress[batchId]}
                    />
                  ))}
                  {col.unbatched.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {totalCount === 0 && (
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">No items match current filters</p>
          </div>
        )}
      </div>

      {/* ─── DESKTOP: Horizontal kanban ─── */}
      <div className="hidden lg:block">
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${columnData.filter(c => !c.collapsed || c.items.length > 0).length * 260}px` }}>
            {columnData.map((col) => {
              if (col.collapsed && col.items.length === 0) return null;
              const batchIds = Object.keys(col.batched);

              return (
                <div
                  key={col.key}
                  className="w-[250px] shrink-0 rounded-[10px] border border-[var(--border)] bg-[var(--muted)]"
                >
                  <div
                    className="flex items-center justify-between rounded-t-[10px] px-3 py-2"
                    style={{ background: col.bgClass }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: col.textClass }}>
                      {col.label}
                    </span>
                    <span
                      className="flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: col.textClass, color: col.bgClass }}
                    >
                      {col.items.length}
                    </span>
                  </div>

                  <p className="px-3 py-1.5 text-[9px] leading-relaxed text-[var(--muted-foreground)]">
                    {col.description}
                  </p>

                  <div className="space-y-2 px-2 pb-2" style={{ minHeight: '40px' }}>
                    {col.items.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">Empty</div>
                    ) : (
                      <>
                        {batchIds.map((batchId) => (
                          <BatchGroup
                            key={batchId}
                            batchId={batchId}
                            items={col.batched[batchId]}
                            progress={batchProgress[batchId]}
                          />
                        ))}
                        {col.unbatched.map((item) => (
                          <ItemCard key={item.id} item={item} />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Batch group ─── */

function BatchGroup({
  batchId,
  items,
  progress,
}: {
  batchId: string;
  items: PipelineItem[];
  progress?: { total: number; done: number };
}) {
  const [collapsed, setCollapsed] = useState(false);

  const displayName = batchId
    .replace(/[-_]\d{8,14}$/g, '')
    .replace(/[-_]\d{4}_\d{2}_\d{2}.*$/g, '')
    .replace(/[_-]/g, ' ')
    .trim();

  return (
    <div className="rounded-[8px] border border-dashed border-[var(--border)]">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-[var(--muted-foreground)] transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[var(--muted-foreground)]">
          {displayName}
        </span>
        {progress && (
          <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
            {progress.done}/{progress.total}
          </span>
        )}
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--muted)] text-[9px] font-bold text-[var(--muted-foreground)]">
          {items.length}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 px-1.5 pb-1.5">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
