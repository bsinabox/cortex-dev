// Reusable health summary card. Ported from bs-box-web
// (src/components/operations/HealthCard.tsx) and adapted to cortex-dev's
// CSS-variable theming. Used by the CVL Health dashboard to render one card
// per health category.

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

type HealthCardProps = {
  title: string;
  status: HealthStatus;
  /** Optional health percentage (0–100). Omit for not-yet-scanned categories. */
  score?: number | null;
  /** Optional secondary line, e.g. finding breakdown or last-scan time. */
  subtitle?: string;
};

const STATUS_CONFIG: Record<HealthStatus, { text: string; indicator: string; label: string }> = {
  healthy:  { text: 'text-emerald-600 dark:text-emerald-400', indicator: 'bg-emerald-500',           label: 'Healthy' },
  warning:  { text: 'text-amber-600 dark:text-amber-400',     indicator: 'bg-amber-500',             label: 'Warning' },
  critical: { text: 'text-red-600 dark:text-red-400',         indicator: 'bg-red-500 animate-pulse', label: 'Critical' },
  unknown:  { text: 'text-[var(--muted-foreground)]',         indicator: 'bg-stone-400',             label: 'Not scanned' },
};

export function HealthCard({ title, status, score, subtitle }: HealthCardProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          {title}
        </span>
        <span className={`h-3 w-3 shrink-0 rounded-full ${cfg.indicator}`} />
      </div>
      <div className={`text-3xl font-bold ${cfg.text}`}>
        {typeof score === 'number' ? `${score}%` : cfg.label}
      </div>
      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
        {subtitle ?? cfg.label}
      </div>
    </div>
  );
}

export default HealthCard;
