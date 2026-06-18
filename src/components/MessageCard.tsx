'use client';

import { useState } from 'react';
import { timeAgo } from '@/lib/constants';

interface MessageCardProps {
  author: string;
  messageType: string;
  content: string;
  createdAt: string;
}

const AUTHOR_CONFIG: Record<string, { bg: string; label: string }> = {
  human:               { bg: '#DBEAFE', label: 'Human' },
  codex:               { bg: '#D1FAE5', label: 'Codex' },
  claude_code:         { bg: '#F3E8FF', label: 'Claude' },
  system:              { bg: '#F5F5F4', label: 'System' },
  'agentic-conductor': { bg: '#FEF3C7', label: 'Conductor' },
  agentic_conductor:   { bg: '#FEF3C7', label: 'Conductor' },
};

const TYPE_LABELS: Record<string, string> = {
  checkpoint:       'Checkpoint',
  execution_update: 'Update',
  qa_result:        'QA',
  cross_review:     'Review',
  design:           'Design',
  build_plan:       'Plan',
  approval:         'Approval',
  decision:         'Decision',
  system_note:      'System',
};

const TECHNICAL_MARKERS = [
  'PRINCIPLE_SCORES:', 'SURFACES_JSON:', 'ROUTES_JSON:',
  'COMPONENTS_JSON:', 'TABLES_JSON:', 'APIS_JSON:',
  'QA_EVIDENCE_SPECS_JSON:', 'UNRESOLVED_CONFLICTS:',
  'SCOPE_REFS_JSON:', 'TESTS_JSON:',
  'DESIGN_CONFLICT:', 'NEXT_ROUND:',
  'EXECUTE_RECOMMENDATION:',
];

function isTechLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return TECHNICAL_MARKERS.some(m => t.startsWith(m)) ||
    t.startsWith('QA_RESULT:') ||
    t.startsWith('QA_FAIL_REASON:') ||
    t.startsWith('RESULT:');
}

function extractBadge(content: string): { text: string; pass: boolean } | null {
  const qa = content.match(/QA_RESULT:\s*(PASS|FAIL)/i);
  if (qa) {
    const val = qa[1].toUpperCase();
    if (val === 'FAIL') {
      const reason = content.match(/QA_FAIL_REASON:\s*(\S+)/);
      const r = reason?.[1];
      return { text: r && r !== 'none' ? `FAIL · ${r}` : 'FAIL', pass: false };
    }
    return { text: 'PASS', pass: true };
  }
  const res = content.match(/^RESULT:\s*(\w+)/m);
  if (res) {
    const val = res[1].toUpperCase();
    return { text: val, pass: val === 'READY' || val === 'PASS' };
  }
  return null;
}

function extractTitle(content: string, readable: string[]): string {
  // Markdown heading
  const h = content.match(/^#{1,3}\s+(.+)/m);
  if (h) return h[1].replace(/[*_`#]/g, '').trim().substring(0, 150);

  // Conductor dispatch shorthand
  if (content.startsWith('Started asynchronous')) {
    const m = content.match(/Started asynchronous Codex (\w+).*?for (AG-\w+)/);
    return m ? `Started ${m[1]} for ${m[2]}` : 'Started async process';
  }
  if (content.startsWith('Dispatched')) {
    const m = content.match(/Dispatched (\w+) worker/);
    return m ? `Dispatched ${m[1]} worker` : 'Dispatched worker';
  }

  // First readable line (skip pure-metadata lines)
  if (readable.length > 0) {
    let t = readable[0].replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '');
    if (t.length > 150) t = t.substring(0, 147) + '…';
    return t;
  }
  return '';
}

function parseMessage(content: string) {
  const lines = content.split('\n');
  const readable: string[] = [];
  const technical: string[] = [];
  let inCode = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      technical.push(raw);
      continue;
    }
    if (inCode) { technical.push(raw); continue; }
    if (!trimmed || trimmed === '---') continue;

    if (isTechLine(trimmed)) {
      technical.push(trimmed);
    } else {
      readable.push(trimmed);
    }
  }

  const badge = extractBadge(content);
  const title = extractTitle(content, readable);

  // Find where summary ends — skip title match in readable
  const startIdx = readable.length > 0 && readable[0] === title ? 1 : 0;
  const summaryLines = readable.slice(startIdx, startIdx + 3);
  const overflowLines = readable.slice(startIdx + 3);

  const isShort = content.length < 250 && technical.length === 0 && overflowLines.length === 0;
  const detailLines = [...overflowLines, ...(technical.length > 0 ? ['', '── Technical ──', ...technical] : [])];
  const hasDetails = detailLines.length > 0;

  return { badge, title, summaryLines, detailLines, hasDetails, isShort };
}

export function MessageCard({ author, messageType, content, createdAt }: MessageCardProps) {
  const [open, setOpen] = useState(false);
  const ac = AUTHOR_CONFIG[author] ?? { bg: '#F5F5F4', label: author };
  const tl = TYPE_LABELS[messageType] ?? messageType;
  const { badge, title, summaryLines, detailLines, hasDetails, isShort } = parseMessage(content);

  return (
    <div className="mb-2 rounded-[8px] border border-[var(--border)] px-3 py-2.5 text-sm">
      {/* Header row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: ac.bg, color: '#292524' }}>
          {ac.label}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          {tl}
        </span>
        {badge && (
          <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: badge.pass ? '#D1FAE5' : '#FEE2E2',
                  color: badge.pass ? '#065F46' : '#991B1B',
                }}>
            {badge.text}
          </span>
        )}
        <span className="ml-auto text-[10px] text-[var(--muted-foreground)] shrink-0">
          {timeAgo(createdAt)}
        </span>
      </div>

      {/* Body */}
      {isShort ? (
        /* Short messages — show inline */
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)] whitespace-pre-wrap">
          {content}
        </p>
      ) : (
        <>
          {title && (
            <p className="mt-1.5 text-xs font-medium text-[var(--foreground)] leading-snug">
              {title}
            </p>
          )}
          {summaryLines.length > 0 && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
              {summaryLines.join(' ').substring(0, 300)}
              {summaryLines.join(' ').length > 300 ? '…' : ''}
            </p>
          )}
          {hasDetails && (
            <div className="mt-2">
              <button type="button" onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {detailLines.length} more lines
              </button>
              {open && (
                <pre className="mt-1.5 rounded-[6px] bg-[var(--muted)] p-2 text-[10px] leading-relaxed text-[var(--muted-foreground)] overflow-x-auto whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                  {detailLines.join('\n')}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
