/**
 * KerTec "Test in KerTec" deep-link helpers.
 *
 * Pure, presentational logic — no DB access, no side effects. Given a Cortex
 * work item's `final_design_summary` (which carries a `ROUTES_JSON:` block of
 * Expo Router design routes), we derive clean app paths and build absolute
 * deep-link URLs into each KerTec environment (Dev / UAT / Prod).
 *
 * The KerTec app is Expo Router with static web output behind a Vercel
 * catch-all rewrite ("/(.*)" -> "/"), so any path resolves client-side behind
 * the app login.
 */

/** Repo identifier for the KerTec field app in `agentic_items.repo`. */
export const KERTEC_REPO = 'kertec-field-app-v2';

/** Live KerTec environment base URLs (no trailing slash). */
export const KERTEC_ENV_BASES = {
  dev: 'https://kertec-dev.bsinabox.com',
  uat: 'https://kertec-uat.bsinabox.com',
  // PROD primary domain. `kertec-prod.bsinabox.com` is an alias of this host.
  prod: 'https://app.kertecllc.com',
} as const;

export type KertecEnv = keyof typeof KERTEC_ENV_BASES;

/** Ordered env metadata for rendering a Dev / UAT / Prod row. */
export const KERTEC_ENVS: ReadonlyArray<{ key: KertecEnv; label: string }> = [
  { key: 'dev', label: 'Dev' },
  { key: 'uat', label: 'UAT' },
  { key: 'prod', label: 'Prod' },
];

/** True when a work item targets the KerTec field app. */
export function isKertecRepo(repo: string | null | undefined): boolean {
  return repo === KERTEC_REPO;
}

/**
 * Convert an Expo Router design route into a stable KerTec web path.
 *
 * Rules:
 *  - strip every "(group)" segment (e.g. "(app)", "(tabs)")
 *  - collapse duplicate / leading / trailing slashes
 *  - on the first dynamic "[param]" segment, truncate to the nearest static
 *    parent (drop the "[param]" segment and everything after it)
 *
 * Examples:
 *  "/(app)/admin/employees/[id]"     -> "/admin/employees"
 *  "/(app)/(tabs)/pto"               -> "/pto"
 *  "/(app)/admin/pto-requests"       -> "/admin/pto-requests"
 *  "/(app)/messages/[conversationId]"-> "/messages"
 *  ""                                -> ""
 */
export function routeToKertecPath(route: string): string {
  if (typeof route !== 'string') return '';
  const out: string[] = [];
  for (const seg of route.split('/')) {
    if (seg === '') continue; // collapse slashes + drop leading/trailing empties
    if (seg.startsWith('(') && seg.endsWith(')')) continue; // strip route group
    if (seg.startsWith('[')) break; // dynamic param -> truncate to static parent
    out.push(seg);
  }
  return out.length === 0 ? '' : '/' + out.join('/');
}

/**
 * Extract the string array following `ROUTES_JSON:` in a design summary.
 * Tolerant of surrounding prose, whitespace, and bracketed "[param]" segments
 * inside the route strings. Returns [] when no parseable block is present.
 */
export function parseRoutesFromDesignSummary(summary: string | null): string[] {
  if (!summary || typeof summary !== 'string') return [];
  const marker = 'ROUTES_JSON:';
  const markerIdx = summary.indexOf(marker);
  if (markerIdx === -1) return [];

  const after = summary.slice(markerIdx + marker.length);
  const start = after.indexOf('[');
  if (start === -1) return [];

  // Walk to the matching top-level ']' while ignoring quoted content, so
  // "[param]" segments inside route strings don't terminate the array early.
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < after.length; i++) {
    const ch = after[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  const arrText = end === -1 ? after.slice(start) : after.slice(start, end + 1);

  try {
    const parsed: unknown = JSON.parse(arrText);
    if (Array.isArray(parsed)) {
      return parsed.filter((r): r is string => typeof r === 'string');
    }
  } catch {
    // Fall through to a tolerant quoted-string scan.
  }

  const matches = arrText.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!matches) return [];
  return matches
    .map((m) => m.slice(1, -1).replace(/\\"/g, '"'))
    .filter((s) => s.length > 0);
}

export interface KertecEnvLinks {
  /** Env base URL, no trailing slash. */
  base: string;
  /** Absolute URL for the most-specific derived path (env home if none). */
  primaryUrl: string;
  /** Every derived path as an absolute URL for this env. */
  links: Array<{ path: string; url: string }>;
}

export interface KertecLinks {
  /** Deduped derived paths (may include "" for the app home). */
  derivedPaths: string[];
  /** Most-specific derived path ("" = env home when no routes). */
  primaryPath: string;
  /** Per-env absolute URLs. */
  envs: Record<KertecEnv, KertecEnvLinks>;
}

function specificity(path: string): number {
  return path === '' ? 0 : path.split('/').filter(Boolean).length;
}

/**
 * Build deduped derived paths and per-env absolute deep-link URLs from a set of
 * design routes. The "primary" path is the most-specific (deepest) derived
 * path; when there are no routes it resolves to the env home.
 */
export function buildKertecLinks(routes: string[]): KertecLinks {
  const derivedPaths: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const path = routeToKertecPath(route);
    if (seen.has(path)) continue;
    seen.add(path);
    derivedPaths.push(path);
  }

  let primaryPath = '';
  for (const path of derivedPaths) {
    if (specificity(path) > specificity(primaryPath)) primaryPath = path;
  }

  const buildEnv = (env: KertecEnv): KertecEnvLinks => {
    const base = KERTEC_ENV_BASES[env];
    return {
      base,
      primaryUrl: base + primaryPath,
      links: derivedPaths.map((path) => ({ path, url: base + path })),
    };
  };

  return {
    derivedPaths,
    primaryPath,
    envs: {
      dev: buildEnv('dev'),
      uat: buildEnv('uat'),
      prod: buildEnv('prod'),
    },
  };
}

/**
 * Pick the env to emphasize for a given item status.
 *  - testing_in_dev / executing        -> dev
 *  - promotion_review / promoting       -> uat
 *  - awaiting_prod_promotion            -> prod
 *  - anything else                      -> dev
 */
export function kertecEnvForStatus(status: string | null | undefined): KertecEnv {
  switch (status) {
    case 'promotion_review':
    case 'promoting':
      return 'uat';
    case 'awaiting_prod_promotion':
      return 'prod';
    case 'testing_in_dev':
    case 'executing':
    default:
      return 'dev';
  }
}
