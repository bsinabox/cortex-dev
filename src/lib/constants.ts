// Pipeline kanban column definitions per SPEC-CORTEX-DEV-001 Section 5.1

export type StatusColumn = {
  key: string;
  label: string;
  description: string;
  statuses: string[];
  color: string;
  bgClass: string;
  textClass: string;
  collapsed?: boolean;
};

export const PIPELINE_COLUMNS: StatusColumn[] = [
  {
    key: 'intake',
    label: 'Intake',
    description: 'Waiting for Hub design session. Start a design conversation to advance.',
    statuses: ['intake', 'awaiting_hub_design'],
    color: 'slate',
    bgClass: 'var(--color-stone-100)',
    textClass: 'var(--color-stone-600)',
  },
  {
    key: 'design',
    label: 'Design',
    description: 'Claude and Codex are designing the solution. Auto-advances to Review when complete.',
    statuses: ['designing', 'cross_review', 'design_conflict'],
    color: 'violet',
    bgClass: '#EDE9FE',
    textClass: '#6D28D9',
  },
  {
    key: 'review',
    label: 'Review',
    description: 'Needs human approval. Approve to start build, or request changes.',
    statuses: ['human_review', 'design_review_hold'],
    color: 'amber',
    bgClass: '#FEF3C7',
    textClass: '#92400E',
  },
  {
    key: 'build',
    label: 'Build',
    description: 'Approved and being built by workers. Auto-advances to QA on completion.',
    statuses: ['approved', 'executing'],
    color: 'blue',
    bgClass: '#DBEAFE',
    textClass: '#1E40AF',
  },
  {
    key: 'qa',
    label: 'QA',
    description: 'Built on dev — verify the changes work, then promote to production.',
    statuses: ['qa', 'testing_in_dev'],
    color: 'teal',
    bgClass: '#CCFBF1',
    textClass: '#0F766E',
  },
  {
    key: 'promotion',
    label: 'Promotion',
    description: 'Verified and moving to production. Approve promotion to complete.',
    statuses: ['promotion_review', 'promoting', 'waiting_migration', 'waiting_prod_evidence'],
    color: 'purple',
    bgClass: '#F3E8FF',
    textClass: '#7C3AED',
  },
  {
    key: 'done',
    label: 'Done',
    description: 'Completed and deployed. No further action needed.',
    statuses: ['done', 'subtasks_complete'],
    color: 'emerald',
    bgClass: '#D1FAE5',
    textClass: '#065F46',
  },
  {
    key: 'blocked',
    label: 'Blocked',
    description: 'Stuck — needs manual intervention or a dependency resolved to continue.',
    statuses: ['blocked', 'readiness_blocked', 'waiting_on_dependency', 'decomposed'],
    color: 'red',
    bgClass: '#FEE2E2',
    textClass: '#991B1B',
  },
  {
    key: 'terminal',
    label: 'Terminal',
    description: 'Cancelled or failed. No further action.',
    statuses: ['cancelled', 'failed'],
    color: 'gray',
    bgClass: 'var(--color-stone-100)',
    textClass: 'var(--color-stone-500)',
    collapsed: true,
  },
];

// ── Pipeline Phases (for chevron progress + status board) ──

export type PipelinePhase = {
  key: string;
  label: string;
  short: string;
  statuses: string[];
  bg: string;
  text: string;
  dot: string;
};

export const PIPELINE_PHASES: PipelinePhase[] = [
  { key: 'design',  label: 'Design',  short: 'Des', statuses: ['designing', 'cross_review', 'design_conflict'], bg: '#EDE9FE', text: '#6D28D9', dot: '#8B5CF6' },
  { key: 'review',  label: 'Review',  short: 'Rev', statuses: ['human_review', 'design_review_hold'],           bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  { key: 'build',   label: 'Build',   short: 'Bld', statuses: ['approved', 'executing'],                        bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  { key: 'qa',      label: 'QA',      short: 'QA',  statuses: ['qa', 'testing_in_dev'],                         bg: '#CCFBF1', text: '#0F766E', dot: '#14B8A6' },
  { key: 'uat',     label: 'UAT',     short: 'UAT', statuses: ['promotion_review'],                             bg: '#FCE7F3', text: '#9D174D', dot: '#EC4899' },
  { key: 'prod',    label: 'Prod',    short: 'Prd', statuses: ['promoting', 'waiting_migration', 'waiting_prod_evidence'], bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
];

// Non-pipeline categories
export const QUEUE_STATUSES = ['intake', 'awaiting_hub_design'];
export const BLOCKED_STATUSES = ['blocked', 'readiness_blocked', 'waiting_on_dependency', 'decomposed'];
export const DONE_STATUSES = ['done', 'subtasks_complete'];

/** Get current pipeline phase index for a status (-1 = pre-pipeline, 6 = done) */
export function getPhaseIndex(status: string): number {
  if (DONE_STATUSES.includes(status)) return PIPELINE_PHASES.length; // past all phases
  for (let i = 0; i < PIPELINE_PHASES.length; i++) {
    if (PIPELINE_PHASES[i].statuses.includes(status)) return i;
  }
  return -1; // queue or blocked — not in pipeline flow
}

/** Get the phase config for a status, or null */
export function getPhaseForStatus(status: string): PipelinePhase | null {
  for (const phase of PIPELINE_PHASES) {
    if (phase.statuses.includes(status)) return phase;
  }
  return null;
}

/** Which pipeline phases to show for an item (MVP skips UAT) */
export function getPhasesForPolicy(executionPolicy: string | null): PipelinePhase[] {
  if (executionPolicy === 'launched_dev_to_uat_to_prod') return PIPELINE_PHASES;
  // MVP items skip UAT
  return PIPELINE_PHASES.filter(p => p.key !== 'uat');
}

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

// Worker session status config
export const WORKER_STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  queued:   { bg: '#DBEAFE', text: '#1E40AF', label: 'Queued',   dot: '#3B82F6' },
  running:  { bg: '#D1FAE5', text: '#065F46', label: 'Running',  dot: '#10B981' },
  complete: { bg: '#D1FAE5', text: '#065F46', label: 'Complete', dot: '#059669' },
  failed:   { bg: '#FEE2E2', text: '#991B1B', label: 'Failed',   dot: '#EF4444' },
  stalled:  { bg: '#FEF3C7', text: '#92400E', label: 'Stalled',  dot: '#F59E0B' },
};

// Worker model config
export const WORKER_MODEL_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  'claude-code': { bg: '#F3E8FF', text: '#7C3AED', label: 'Claude Code' },
  'codex':       { bg: '#D1FAE5', text: '#065F46', label: 'Codex' },
};

// Worker session role config
export const WORKER_ROLE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  implementer: { bg: '#DBEAFE', text: '#1E40AF', label: 'Implementer' },
  verifier:    { bg: '#FEF3C7', text: '#92400E', label: 'Verifier' },
  test_runner: { bg: '#CCFBF1', text: '#0F766E', label: 'Test Runner' },
};

// Ops log severity config
export const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  info:     { bg: 'var(--color-stone-50)',  text: 'var(--color-stone-600)', border: 'var(--color-stone-200)' },
  warning:  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  error:    { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  critical: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
};

// Conductor config keys to display in health view
export const CONFIG_DISPLAY_KEYS = [
  'mode',
  'max_parallel_workers',
  'build_loop_enabled',
  'review_loop_enabled',
  'test_gate_mode',
  'readiness_gate_mode',
  'transition_guard_mode',
  'decomposition_mode',
  'active_batch',
  'heartbeat_kill_enabled',
  'heartbeat_cutover_at',
  'last_heartbeat_at',
] as const;

// VPS service names for health checks
export const VPS_SERVICES = [
  { id: 'agentic-conductor', label: 'Conductor' },
  { id: 'worker-auto-launcher', label: 'Worker Launcher' },
  { id: 'vps-command-daemon', label: 'Command Daemon' },
  { id: 'file-deploy-worker', label: 'File Deploy' },
] as const;

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

// Duration formatter for worker sessions
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '\u2014';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Heartbeat age classifier
export function heartbeatStatus(lastHeartbeat: string | null): 'healthy' | 'warning' | 'stale' | 'unknown' {
  if (!lastHeartbeat) return 'unknown';
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime();
  const ageMins = ageMs / 60000;
  if (ageMins < 5) return 'healthy';
  if (ageMins < 15) return 'warning';
  return 'stale';
}

// Wait time — compact human-readable duration since a timestamp
export function waitTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
