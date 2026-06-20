import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole, getUserName } from '@/lib/auth';
import { HUMAN_GATE_STATUSES } from '@/lib/constants';
import { BottomNav } from '@/components/BottomNav';
import { SideNav } from '@/components/SideNav';
import { NotificationBanner } from '@/components/NotificationBanner';
import { NotificationBell } from '@/components/NotificationBell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = getUserRole(user.id);
  if (!role) redirect('/login'); // Unknown user — deny access

  const userName = getUserName(user.id);

  // Fetch approval badge count
  const { count } = await supabase
    .from('agentic_items')
    .select('*', { count: 'exact', head: true })
    .in('status', HUMAN_GATE_STATUSES as unknown as string[]);

  const approvalCount = count ?? 0;

  return (
    <div className="min-h-dvh">
      <SideNav
        approvalCount={approvalCount}
        userName={userName}
        userRole={role}
      />

      {/* Main content — offset for sidebar on desktop */}
      <main className="pb-[var(--bottom-nav-height)] lg:pb-0 lg:pl-60">
        {/* Mobile header bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[var(--primary)] text-xs font-bold text-white">
              C
            </div>
            <span className="text-sm font-semibold tracking-tight">Cortex</span>
          </div>
          <NotificationBell />
        </div>

        {/* Desktop notification bell — fixed top-right */}
        <div className="hidden lg:fixed lg:right-8 lg:top-4 lg:z-30 lg:block">
          <NotificationBell />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <NotificationBanner />
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>

      <BottomNav approvalCount={approvalCount} />
    </div>
  );
}
