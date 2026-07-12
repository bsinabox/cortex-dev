/**
 * Host-aware brand wordmark.
 *
 * Prod (cortex.bsinabox.com) and dev (cortex-dev.bsinabox.com) are served by
 * the SAME build, so the visible wordmark can't be hardcoded — it must be
 * derived from the request host at runtime:
 *   - "Cortex Dev" when the host starts with "cortex-dev" (dev host) or ends
 *     with ".vercel.app" (Vercel preview deployment)
 *   - "Cortex" otherwise (production host, and the null/unknown fallback)
 *
 * Only the human-visible wordmark is affected. Internal identifiers such as the
 * 'cortex-dev-email' localStorage key, the Vercel project name, and the repo
 * name are intentionally left unchanged.
 */
export function brandLabelFromHost(host: string | null | undefined): string {
  if (!host) return 'Cortex';
  // Drop any port suffix (e.g. "cortex-dev.bsinabox.com:443") and normalize.
  const h = host.split(':')[0].toLowerCase();
  if (h.startsWith('cortex-dev') || h.endsWith('.vercel.app')) {
    return 'Cortex Dev';
  }
  return 'Cortex';
}
