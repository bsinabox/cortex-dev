/**
 * "Test in KerTec" deep links (Dev / UAT / Prod) for a KerTec work item.
 *
 * Pure presentational component — renders only anchors, no hooks or state — so
 * it can be used from both server components (item detail page) and client
 * components (approvals board). Links are computed at render from the item's
 * `final_design_summary`; nothing is fetched or persisted.
 *
 * Renders nothing for non-KerTec items.
 */
import {
  KERTEC_ENVS,
  type KertecEnv,
  buildKertecLinks,
  isKertecRepo,
  kertecEnvForStatus,
  parseRoutesFromDesignSummary,
} from '@/lib/kertecLinks';

interface KertecTestLinksProps {
  repo: string;
  status: string;
  finalDesignSummary: string | null;
  /** 'full' = titled section with buttons + extra paths; 'compact' = single row. */
  variant?: 'full' | 'compact';
}

const ENV_BUTTON_BASE =
  'inline-flex items-center justify-center rounded-[8px] border px-3 py-1.5 text-xs font-semibold transition-colors';
const ENV_ACTIVE =
  'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700';
const ENV_IDLE =
  'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]';

function pathLabel(path: string): string {
  return path === '' ? 'Home' : path;
}

export function KertecTestLinks({
  repo,
  status,
  finalDesignSummary,
  variant = 'full',
}: KertecTestLinksProps) {
  if (!isKertecRepo(repo)) return null;

  const routes = parseRoutesFromDesignSummary(finalDesignSummary);
  const { derivedPaths, primaryPath, envs } = buildKertecLinks(routes);
  const activeEnv: KertecEnv = kertecEnvForStatus(status);
  const extras = derivedPaths.filter((p) => p !== primaryPath);

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Test in KerTec
        </span>
        {KERTEC_ENVS.map(({ key, label }) => (
          <a
            key={key}
            href={envs[key].primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-[6px] border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              key === activeEnv
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
          Test in KerTec
        </p>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {primaryPath ? primaryPath : 'App home'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {KERTEC_ENVS.map(({ key, label }) => (
          <a
            key={key}
            href={envs[key].primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ENV_BUTTON_BASE} ${key === activeEnv ? ENV_ACTIVE : ENV_IDLE}`}
          >
            {label}
          </a>
        ))}
      </div>

      {extras.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
            Other affected paths
          </p>
          <div className="mt-1.5 space-y-1.5">
            {extras.map((path) => (
              <div key={path} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-mono text-[11px] text-[var(--foreground)]">
                  {pathLabel(path)}
                </span>
                <span className="flex items-center gap-1.5">
                  {KERTEC_ENVS.map(({ key, label }) => (
                    <a
                      key={key}
                      href={envs[key].base + path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[5px] border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                      {label}
                    </a>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
