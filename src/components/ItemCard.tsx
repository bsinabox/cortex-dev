'use client';

import Link from 'next/link';
import {
  PRIORITY_CONFIG,
  REPO_CONFIG,
  STATUS_LABELS,
  timeAgo,
} from '@/lib/constants';

export type PipelineItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  repo: string;
  batch_id: string | null;
  updated_at: string;
  escalated_at: string | null;
  escalation_reason: string | null;
  current_round: number;
  execution_policy: string | null;
  component_id: string | null;
  assignee: string | null;
};

interface ItemCardProps {
  item: PipelineItem;
}

export function ItemCard({ item }: ItemCardProps) {
  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;

  return (
    <Link
      href={`/pipeline/${item.id}`}
      className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-2.5 transition-colors active:border-[var(--primary)] lg:p-3 lg:hover:border-[var(--primary)]"
    >
      {/* Header: SID + escalation + priority */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-[var(--foreground)] lg:text-xs">
          {sid}
        </span>
        <div className="flex items-center gap-1.5">
          {item.escalated_at && (
            <span title={item.escalation_reason ?? 'Escalated'} className="flex h-4 w-4 items-center justify-center lg:h-5 lg:w-5">
              <svg className="h-3 w-3 text-amber-500 lg:h-3.5 lg:w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          <span
            className="inline-flex rounded-[5px] px-1.5 py-0.5 text-[9px] font-bold lg:rounded-[6px] lg:text-[10px]"
            style={{ background: priority.bg, color: priority.text }}
          >
            {priority.label}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--foreground)] lg:mt-1.5 lg:text-sm">
        {item.title}
      </p>

      {/* Footer: repo + status + time */}
      <div className="mt-1.5 flex items-center justify-between gap-2 lg:mt-2">
        <span
          className="inline-flex rounded-[5px] px-1.5 py-0.5 text-[9px] font-medium lg:rounded-[6px] lg:text-[10px]"
          style={{ background: repo.bg, color: repo.text }}
        >
          {repo.label}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)] lg:text-[11px]">
          {statusLabel} &middot; {timeAgo(item.updated_at)}
        </span>
      </div>
    </Link>
  );
}
