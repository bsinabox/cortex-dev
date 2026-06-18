'use client';

import { useState, useMemo } from 'react';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { ItemCard, type PipelineItem } from '@/components/ItemCard';
import { PIPELINE_COLUMNS, HUMAN_GATE_STATUSES } from '@/lib/constants';

interface PipelineBoardProps {
  initialItems: PipelineItem[];
}

export function PipelineBoard({ initialItems }: PipelineBoardProps) {
  const { data: items } = useRealtimeTable<PipelineItem>(
    'agentic_items',
    initialItems
  );

  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [myAttention, setMyAttention] = useState(false);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (repoFilter !== 'all' && item.repo !== repoFilter) return false;
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (myAttention && !HUMAN_GATE_STATUSES.includes(item.status as typeof HUMAN_GATE_STATUSES[number])) return false;
      return true;
    });
  }, [items, repoFilter, priorityFilter, myAttention]);

  // Group items by column
  const columnData = useMemo(() => {
    return PIPELINE_COLUMNS.map((col) => ({
      ...col,
      items: filteredItems
        .filter((item) => col.statuses.includes(item.status))
        .sort((a, b) => {
          const pOrder = ['p0', 'p1', 'p2', 'p3'];
          const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
          if (pDiff !== 0) return pDiff;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }),
    }));
  }, [filteredItems]);

  const totalCount = filteredItems.length;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
        >
          <option value="all">All repos</option>
          <option value="kertec-field-app-v2">KerTec</option>
          <option value="bs-box-web">BS Box</option>
          <option value="cortex-dev">Cortex</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
        >
          <option value="all">All priorities</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </select>

        <button
          onClick={() => setMyAttention((v) => !v)}
          className={`rounded-[8px] border px-3 py-1.5 text-sm transition-colors ${
            myAttention
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]'
          }`}
        >
          My attention
        </button>

        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {totalCount} item{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Kanban board — horizontal scroll on mobile, visible columns on desktop */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: `${columnData.filter(c => !c.collapsed || c.items.length > 0).length * 260}px` }}>
          {columnData.map((col) => {
            // Hide collapsed columns with no items
            if (col.collapsed && col.items.length === 0) return null;

            return (
              <div
                key={col.key}
                className="w-[250px] shrink-0 rounded-[10px] border border-[var(--border)] bg-[var(--muted)]"
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between rounded-t-[10px] px-3 py-2"
                  style={{ background: col.bgClass }}
                >
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: col.textClass }}
                  >
                    {col.label}
                  </span>
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: col.textClass, color: col.bgClass }}
                  >
                    {col.items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 p-2" style={{ minHeight: '60px' }}>
                  {col.items.length === 0 ? (
                    <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">
                      Empty
                    </div>
                  ) : (
                    col.items.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
