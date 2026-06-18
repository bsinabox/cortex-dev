import { createServerClient } from '@/lib/supabase/server';

export default async function ApprovalsPage() {
  const supabase = await createServerClient();

  const { data: items, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, updated_at')
    .in('status', ['human_review', 'testing_in_dev', 'design_review_hold', 'promotion_review'])
    .order('updated_at', { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Items needing human action — approval workflow coming in Phase 5
      </p>

      {error ? (
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Supabase read error</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : items && items.length > 0 ? (
        <div className="mt-6 space-y-3">
          {items.map((item) => {
            const sid = item.id.substring(0, 8).toUpperCase();
            const hoursWaiting = Math.round(
              (Date.now() - new Date(item.updated_at).getTime()) / 3600000
            );
            return (
              <div
                key={item.id}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{sid}</span>
                      <span className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm">{item.title}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${
                    hoursWaiting > 4 ? 'text-red-500' : hoursWaiting > 1 ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {hoursWaiting}h waiting
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            All caught up — no items need your attention right now.
          </p>
        </div>
      )}
    </div>
  );
}
