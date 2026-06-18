'use client';

import Link from 'next/link';
import {
  STATUS_LABELS,
  PRIORITY_CONFIG,
  REPO_CONFIG,
  timeAgo,
} from '@/lib/constants';

export type PipelineItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  repo: string;
  updated_at: string;
  escalated_at: string | null;
  escalation_reason: string | null;
  current_round: number;
};

interface ItemCardProps {
  item: PipelineItem;
}

export function ItemCard({ item }: ItemCardProps) {
  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };

  return (
    <Link
      href={`/pipeline/${item.id}`}
      className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--primary)]"
    >
      {/* Header: SID + priority */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
          {sid}
        </span>
        <div className="flex items-center gap-1.5">
          {item.escalated_at && (
            <span title={item.escalation_reason ?? 'Escalated'} className="flex h-5 w-5 items-center justify-center">
              <svg className="h-3.5 w-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          <span
            className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: priority.bg, color: priority.text }}
          >
            {priority.label}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-[var(--foreground)]">
        {item.title}
      </p>

      {/* Footer: repo + time ago */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: repo.bg, color: repo.text }}
        >
          {repo.label}
        </span>
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {timeAgo(item.updated_at)}
        </span>
      </div>
    </Link>
  );
}
