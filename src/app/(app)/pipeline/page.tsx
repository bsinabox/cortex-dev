import { createServerClient } from '@/lib/supabase/server';

export default async function PipelinePage() {
  const supabase = await createServerClient();

  const { data: items, error } = await supabase
    .from('agentic_items')
    .select('id, title, status, priority, repo, updated_at')
    .neq('status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Conductor items by status — kanban view coming in Phase 3
      </p>

      {error ? (
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Supabase read error</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            Showing {items?.length ?? 0} items (read access verified)
          </p>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">SID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Priority</th>
                </tr>
              </thead>
              <tbody>
                {items?.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      {item.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5">{item.title}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium uppercase">{item.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
