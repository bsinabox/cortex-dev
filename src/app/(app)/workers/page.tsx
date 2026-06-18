import { createServerClient } from '@/lib/supabase/server';

export default async function WorkersPage() {
  const supabase = await createServerClient();

  const { data: workers, error } = await supabase
    .from('worker_sessions')
    .select('id, session_number, title, status, worker_model, session_role, last_heartbeat')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Worker sessions grid — live monitoring coming in Phase 4
      </p>

      {error ? (
        <div className="mt-6 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Supabase read error</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            Showing {workers?.length ?? 0} sessions (read access verified)
          </p>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)]">Model</th>
                </tr>
              </thead>
              <tbody>
                {workers?.map((w) => (
                  <tr key={w.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      #{w.session_number}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5">{w.title}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{w.worker_model}</td>
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
