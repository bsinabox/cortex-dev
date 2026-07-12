'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import {
  STATUS_LABELS,
  PRIORITY_CONFIG,
  REPO_CONFIG,
  HUMAN_GATE_STATUSES,
} from '@/lib/constants';
import {
  RESOLUTION_ACTIONS,
  RESOLUTION_ACTION_LABELS,
  STATUS_TO_TRIGGER,
} from '@/lib/learning';
import type { ResolutionAction, TriggerType } from '@/lib/learning';
import { KertecTestLinks } from '@/components/KertecTestLinks';
import { approveWithResolution, rejectWithResolution } from './actions';

type ApprovalItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  repo: string;
  updated_at: string;
  escalated_at: string | null;
  escalation_reason: string | null;
  final_design_summary: string | null;
};

const CHANGE_REQUESTABLE: string[] = [
  'human_review',
  'design_review_hold',
  'testing_in_dev',
];

const H_CLASSES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'] as const;

interface ApprovalsBoardProps {
  initialItems: ApprovalItem[];
}

export function ApprovalsBoard({ initialItems }: ApprovalsBoardProps) {
  const { data: allItems } = useRealtimeTable<ApprovalItem>(
    'agentic_items',
    initialItems
  );

  const items = useMemo(() => {
    return allItems
      .filter((item) =>
        HUMAN_GATE_STATUSES.includes(item.status as typeof HUMAN_GATE_STATUSES[number])
      )
      .sort((a, b) => {
        const pOrder = ['p0', 'p1', 'p2', 'p3'];
        const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
        if (pDiff !== 0) return pDiff;
        return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      });
  }, [allItems]);

  if (items.length === 0) {
    return (
      <div className="mt-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950 dark:text-emerald-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          All caught up — no items need your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ApprovalCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ApprovalCard({ item }: { item: ApprovalItem }) {
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [resolutionAction, setResolutionAction] = useState<ResolutionAction>('approved_as_is');
  const [resolutionDetail, setResolutionDetail] = useState('');
  const [hClass, setHClass] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const sid = item.id.substring(0, 8).toUpperCase();
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.p3;
  const repo = REPO_CONFIG[item.repo] ?? { label: item.repo, bg: 'var(--color-stone-100)', text: 'var(--color-stone-600)' };
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;

  const hoursWaiting = (Date.now() - new Date(item.updated_at).getTime()) / 3600000;
  const urgencyColor = hoursWaiting > 4 ? 'text-red-500' : hoursWaiting > 1 ? 'text-amber-500' : 'text-emerald-500';

  const canRequestChanges = CHANGE_REQUESTABLE.includes(item.status);
  const triggerType: TriggerType = STATUS_TO_TRIGGER[item.status] ?? 'human_review';
  const showHClass = item.status === 'design_review_hold';

  const statusDescription: Record<string, string> = {
    human_review: 'Needs design review',
    testing_in_dev: 'Needs testing validation',
    design_review_hold: 'Escalated — design hold',
    promotion_review: 'Merge conflict needs resolution',
  };

  const handleApprove = useCallback(async () => {
    setIsSubmitting(true);
    setResult(null);
    const res = await approveWithResolution(item.id, {
      trigger_type: triggerType,
      resolution_action: resolutionAction,
      resolution_detail: resolutionDetail,
      h_class: hClass,
    });
    setResult(res);
    setIsSubmitting(false);
    if (res.ok) setMode('idle');
  }, [item.id, triggerType, resolutionAction, resolutionDetail, hClass]);

  const handleQuickApprove = useCallback(async () => {
    setIsSubmitting(true);
    setResult(null);
    const res = await approveWithResolution(item.id, {
      trigger_type: triggerType,
      resolution_action: 'approved_as_is',
      resolution_detail: '',
      h_class: null,
    });
    setResult(res);
    setIsSubmitting(false);
  }, [item.id, triggerType]);

  const handleReject = useCallback(async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    setResult(null);
    const res = await rejectWithResolution(item.id, feedback.trim(), {
      trigger_type: triggerType,
      resolution_action: resolutionAction,
      resolution_detail: resolutionDetail || feedback.trim(),
      h_class: hClass,
    });
    setResult(res);
    setIsSubmitting(false);
    if (res.ok) {
      setMode('idle');
      setFeedback('');
    }
  }, [item.id, feedback, triggerType, resolutionAction, resolutionDetail, hClass]);

  const resetForm = () => {
    setMode('idle');
    setResolutionAction('approved_as_is');
    setResolutionDetail('');
    setHClass(null);
    setFeedback('');
  };

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{sid}</span>
            <span
              className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: priority.bg, color: priority.text }}
            >
              {priority.label}
            </span>
            <span
              className="inline-flex rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: repo.bg, color: repo.text }}
            >
              {repo.label}
            </span>
            {item.escalated_at && (
              <span className="text-amber-500" title={item.escalation_reason ?? 'Escalated'}>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[var(--foreground)]">{item.title}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {statusDescription[item.status] ?? statusLabel}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${urgencyColor}`}>
          {hoursWaiting < 1 ? `${Math.round(hoursWaiting * 60)}m` : `${Math.round(hoursWaiting)}h`} waiting
        </span>
      </div>

      {/* Design summary preview */}
      {item.final_design_summary && (
        <div className="mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--muted)] p-3">
          <p className="line-clamp-3 text-xs text-[var(--muted-foreground)]">
            {item.final_design_summary}
          </p>
        </div>
      )}

      {/* Test in KerTec deep links (KerTec items only) */}
      {item.repo === 'kertec-field-app-v2' && (
        <div className="mt-3">
          <KertecTestLinks
            repo={item.repo}
            status={item.status}
            finalDesignSummary={item.final_design_summary}
            variant="compact"
          />
        </div>
      )}

      {/* Action result */}
      {result && (
        <div className={`mt-3 rounded-[8px] p-2 text-xs ${
          result.ok
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
        }`}>
          {result.ok ? 'Action completed — resolution captured' : result.error}
        </div>
      )}

      {/* Resolution capture form (approve mode) */}
      {mode === 'approve' && (
        <div className="mt-3 space-y-3 rounded-[8px] border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Resolution capture — how was this resolved?
          </p>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Resolution action
            </label>
            <select
              value={resolutionAction}
              onChange={(e) => setResolutionAction(e.target.value as ResolutionAction)}
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
            >
              {RESOLUTION_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {RESOLUTION_ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </div>

          {showHClass && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
                H-class (escalation category)
              </label>
              <select
                value={hClass ?? ''}
                onChange={(e) => setHClass(e.target.value || null)}
                className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">None / not applicable</option>
                {H_CLASSES.map((hc) => (
                  <option key={hc} value={hc}>{hc}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Detail (optional)
            </label>
            <textarea
              value={resolutionDetail}
              onChange={(e) => setResolutionDetail(e.target.value)}
              placeholder="Brief notes on what you did or changed..."
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="rounded-[8px] bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Approving...' : 'Approve with resolution'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject/request changes form */}
      {mode === 'reject' && (
        <div className="mt-3 space-y-3 rounded-[8px] border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Request changes — describe the issue and classify the resolution
          </p>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what needs to change..."
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Resolution type
            </label>
            <select
              value={resolutionAction}
              onChange={(e) => setResolutionAction(e.target.value as ResolutionAction)}
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
            >
              {RESOLUTION_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {RESOLUTION_ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </div>

          {showHClass && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
                H-class
              </label>
              <select
                value={hClass ?? ''}
                onChange={(e) => setHClass(e.target.value || null)}
                className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">None</option>
                {H_CLASSES.map((hc) => (
                  <option key={hc} value={hc}>{hc}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={isSubmitting || !feedback.trim()}
              className="rounded-[8px] bg-amber-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send with resolution'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Primary action buttons */}
      {mode === 'idle' && !result?.ok && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleQuickApprove}
            disabled={isSubmitting}
            className="rounded-[8px] bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Approving...' : 'Approve'}
          </button>
          <button
            onClick={() => { setMode('approve'); setResolutionAction('approved_as_is'); }}
            className="rounded-[8px] border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
          >
            Approve with details
          </button>
          {canRequestChanges && (
            <button
              onClick={() => { setMode('reject'); setResolutionAction('major_revision'); }}
              className="rounded-[8px] bg-amber-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600"
            >
              Request changes
            </button>
          )}
          <Link
            href={`/pipeline/${item.id}`}
            className="rounded-[8px] border border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            View detail
          </Link>
        </div>
      )}
    </div>
  );
}
