'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveItem, requestChanges } from '../actions';

interface ItemDetailActionsProps {
  itemId: string;
  sid: string;
  status: string;
  bootPrompt: string;
  needsAction: boolean;
}

const APPROVABLE = new Set(['human_review', 'testing_in_dev', 'design_review_hold', 'promotion_review']);
const CHANGEABLE = new Set(['human_review', 'testing_in_dev', 'design_review_hold']);

export function ItemDetailActions({ itemId, sid, status, bootPrompt, needsAction }: ItemDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  const canApprove = APPROVABLE.has(status);
  const canChange = CHANGEABLE.has(status);

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveItem(itemId);
      if (res.ok) {
        setActionResult({ type: 'success', msg: 'Approved \u2014 advancing to next phase' });
        router.refresh();
      } else {
        setActionResult({ type: 'error', msg: res.error ?? 'Failed to approve' });
      }
      setTimeout(() => setActionResult(null), 4000);
    });
  };

  const handleRequestChanges = () => {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    if (!feedback.trim()) return;
    startTransition(async () => {
      const res = await requestChanges(itemId, feedback.trim());
      if (res.ok) {
        setActionResult({ type: 'success', msg: 'Changes requested \u2014 sent back for revision' });
        setShowFeedback(false);
        setFeedback('');
        router.refresh();
      } else {
        setActionResult({ type: 'error', msg: res.error ?? 'Failed to request changes' });
      }
      setTimeout(() => setActionResult(null), 4000);
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bootPrompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = bootPrompt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const approveLabel = status === 'testing_in_dev'
    ? 'Sign Off'
    : status === 'promotion_review'
      ? 'Promote'
      : 'Ship It';

  return (
    <div>
      {/* Result banner */}
      {actionResult && (
        <div className={`mb-2 rounded-[8px] px-3 py-2 text-xs font-medium ${
          actionResult.type === 'success'
            ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'border border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300'
        }`}>
          {actionResult.msg}
        </div>
      )}

      {/* Button row */}
      <div className="flex items-center gap-2">
        {canApprove && (
          <button
            onClick={handleApprove}
            disabled={pending}
            className="rounded-[8px] bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {pending ? 'Processing\u2026' : approveLabel}
          </button>
        )}

        {canChange && (
          <button
            onClick={handleRequestChanges}
            disabled={pending}
            className={`rounded-[8px] border px-4 py-2 text-sm font-medium transition-opacity active:opacity-80 disabled:opacity-50 ${
              showFeedback
                ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300'
                : 'border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            {showFeedback ? 'Send' : 'Request Changes'}
          </button>
        )}

        <button
          onClick={handleCopy}
          className={`rounded-[8px] border px-4 py-2 text-sm font-medium transition-colors ${
            copied
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'border-[var(--border)] text-[var(--muted-foreground)] active:bg-[var(--muted)]'
          }`}
        >
          {copied ? '\u2713 Copied' : 'Boot'}
        </button>
      </div>

      {/* Feedback textarea (expanded when Request Changes clicked) */}
      {showFeedback && (
        <div className="mt-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what needs to change..."
            rows={3}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            autoFocus
          />
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => { setShowFeedback(false); setFeedback(''); }}
              className="rounded-[6px] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
