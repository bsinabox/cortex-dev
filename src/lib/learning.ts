// Learning Layer constants — mirrors V52 agentic-learning-layer.js
// Used by resolution capture form and learning dashboard

export const TRIGGER_TYPES = [
  'design_review_hold',
  'readiness_blocked',
  'promotion_review',
  'compliance_blocked',
  'testing_in_dev',
  'human_review',
  'hub_scoping',
  'blocked',
] as const;

export type TriggerType = typeof TRIGGER_TYPES[number];

export const RESOLUTION_ACTIONS = [
  'approved_as_is',
  'minor_edit',
  'major_revision',
  'scope_change',
  'rejected',
  'reassigned',
  'environment_fix',
  'config_change',
  'override',
  'deferred',
] as const;

export type ResolutionAction = typeof RESOLUTION_ACTIONS[number];

// Human-readable labels
export const RESOLUTION_ACTION_LABELS: Record<ResolutionAction, string> = {
  approved_as_is: 'Approved as-is',
  minor_edit: 'Minor edit',
  major_revision: 'Major revision',
  scope_change: 'Scope change',
  rejected: 'Rejected',
  reassigned: 'Reassigned',
  environment_fix: 'Environment fix',
  config_change: 'Config change',
  override: 'Override',
  deferred: 'Deferred',
};

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  design_review_hold: 'Design review hold',
  readiness_blocked: 'Readiness blocked',
  promotion_review: 'Promotion review',
  compliance_blocked: 'Compliance blocked',
  testing_in_dev: 'Testing in dev',
  human_review: 'Human review',
  hub_scoping: 'Hub scoping',
  blocked: 'Blocked',
};

// Map status → trigger_type for the capture form
export const STATUS_TO_TRIGGER: Record<string, TriggerType> = {
  human_review: 'human_review',
  design_review_hold: 'design_review_hold',
  testing_in_dev: 'testing_in_dev',
  promotion_review: 'promotion_review',
};

// Resolution action colors for badges
export const RESOLUTION_ACTION_CONFIG: Record<string, { bg: string; text: string }> = {
  approved_as_is: { bg: '#D1FAE5', text: '#065F46' },
  minor_edit: { bg: '#DBEAFE', text: '#1E40AF' },
  major_revision: { bg: '#FEF3C7', text: '#92400E' },
  scope_change: { bg: '#F3E8FF', text: '#7C3AED' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
  reassigned: { bg: '#CCFBF1', text: '#0F766E' },
  environment_fix: { bg: '#FCE7F3', text: '#9D174D' },
  config_change: { bg: '#E0E7FF', text: '#3730A3' },
  override: { bg: '#FEF3C7', text: '#92400E' },
  deferred: { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)' },
};

// Graduation rule status colors
export const GRADUATION_STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  collecting: { bg: '#DBEAFE', text: '#1E40AF', label: 'Collecting' },
  proposing: { bg: '#FEF3C7', text: '#92400E', label: 'Proposing' },
  observing: { bg: '#F3E8FF', text: '#7C3AED', label: 'Observing' },
  graduated: { bg: '#D1FAE5', text: '#065F46', label: 'Graduated' },
  suspended: { bg: '#FEE2E2', text: '#991B1B', label: 'Suspended' },
};

// Outcome colors
export const OUTCOME_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)', label: 'Pending' },
  succeeded: { bg: '#D1FAE5', text: '#065F46', label: 'Succeeded' },
  succeeded_with_stops: { bg: '#CCFBF1', text: '#0F766E', label: 'Succeeded (w/ stops)' },
  cancelled: { bg: 'var(--color-stone-100)', text: 'var(--color-stone-500)', label: 'Cancelled' },
  failed_again: { bg: '#FEE2E2', text: '#991B1B', label: 'Failed again' },
  failed_different: { bg: '#FEF3C7', text: '#92400E', label: 'Failed (different)' },
};
