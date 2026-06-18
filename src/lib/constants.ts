// Pipeline kanban column definitions per SPEC-CORTEX-DEV-001 Section 5.1

export type StatusColumn = {
  key: string;
  label: string;
  statuses: string[];
  color: string;        // Tailwind-compatible color token
  bgClass: string;      // CSS var for column header bg
  textClass: string;    // CSS var for column header text
  collapsed?: boolean;
};

export const PIPELINE_COLUMNS: StatusColumn[] = [
  {
    key: 'intake',
    label: 'Intake',
    statuses: ['intake', 'awaiting_hub_design'],
    color: 'slate',
    bgClass: 'var(--color-stone-100)',
    textClass: 'var(--color-stone-600)',
  },
  {
    key: 'design',
    label: 'Design',
    statuses: ['designing', 'cross_review', 'design_conflict'],
    color: 'violet',
    bgClass: '#EDE9FE',
    textClass: '#6D28D9',
  },
  {
    key: 'review',
    label: 'Review',
    statuses: ['human_review', 'design_review_hold'],
    color: 'amber',
    bgClass: '#FEF3C7',
    textClass: '#92400E',
  },
  {
    key: 'build',
    label: 'Build',
    statuses: ['approved', 'executing'],
    color: 'blue',
    bgClass: '#DBEAFE',
    textClass: '#1E40AF',
  },
  {
    key: 'qa',
    label: 'QA',
    statuses: ['qa', 'testing_in_dev'],
    color: 'teal',
    bgClass: '#CCFBF1',
    textClass: '#0F766E',
  },
  {
    key: 'promotion',
    label: 'Promotion',
    statuses: ['promotion_review', 'promoting', 'waiting_migration', 'waiting_prod_evidence'],
    color: 'purple',
    bgClass: '#F3E8FF',
    textClass: '#7C3AED',
  },
  {
    key: 'done',
    label: 'Done',
    statuses: ['done', 'subtasks_complete'],
    color: 'emerald',
    bgClass: '#D1FAE5',
    textClass: '#065F46',
  },
  {
    key: 'blocked',
    label: 'Blocked',
    statuses: ['blocked', 'readiness_blocked', 'waiting_on_dependency', 'decomposed'],
    color: 'red',
    bgClass: '#FEE2E2',
    textClass: '#991B1B',
  },
  {
    key: 'terminal',
    label: 'Terminal',
    statuses: ['cancelled', 'failed'],
    color: 'gray',
    bgClass: 'var(--color-stone-100)',
    textClass: 'var(--color-stone-500)',
    collapsed: true,
  },
];

// Human-gate statuses (items needing human action)
export const HUMAN_GATE_STATUSES = [
  'human_review',
  'testing_in_dev',
  'design_review_hold',
  'promotion_review',
] as const;

// Status → readable label
export const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake',
  awaiting_hub_design: 'Awaiting design',
  designing: 'Designing',
  cross_review: 'Cross review',
  design_conflict: 'Design conflict',
  human_review: 'Needs review',
  design_review_hold: 'Design hold',
  approved: 'Approved',
  executing: 'Executing',
  qa: 'QA',
  testing_in_dev: 'Testing in dev',
  promotion_review: 'Promotion review',
  promoting: 'Promoting',
  waiting_migration: 'Waiting migration',
  waiting_prod_evidence: 'Waiting evidence',
  done: 'Done',
  subtasks_complete: 'Subtasks done',
  blocked: 'Blocked',
  readiness_blocked: 'Readiness blocked',
  waiting_on_dependency: 'Waiting dep',
  decomposed: 'Decomposed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

// Priority color config
export const PRIORITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  p0: { bg: '#FEE2E2', text: '#991B1B', label: 'P0' },
  p1: { bg: '#FEF3C7', text: '#92400E', label: 'P1' },
  p2: { bg: '#DBEAFE', text: '#1E40AF', label: 'P2' },
  p3: { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)', label: 'P3' },
};

// Repo display config
export const REPO_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  'kertec-field-app-v2': { label: 'KerTec', bg: '#DBEAFE', text: '#1E40AF' },
  'bs-box-web': { label: 'BS Box', bg: '#F3E8FF', text: '#7C3AED' },
  'cortex-dev': { label: 'Cortex', bg: '#CCFBF1', text: '#0F766E' },
  'boltbox-app': { label: 'BoltBox', bg: '#FEF3C7', text: '#92400E' },
};

// Time ago helper
export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
