import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { STATUS_LABELS, TICKET_PRIORITY_CONFIG } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Ticket detail — canonical KerTec ticket by ref, plus every agentic_item that
 * references it (agentic_items.ticket_ref → tickets.ref).
 *
 * Read-only view: no writes happen here. Each linked item is a link into its
 * pipeline detail (/pipeline/<id>), giving a two-way item <-> ticket trail.
 */

type Ticket = {
  ref: string;
  subject: string | null;
  description: string | null;
  request_kind: string | null;
  capability: string | null;
  tier: string | null;
  client_status: string | null;
  priority: string | null;
  build_state: string | null;
  evidence: string | null;
  scope: string | null;
};

type LinkedItem = {
  id: string;
  title: string | null;
  status: string | null;
};

/* ── small presentational helper ── */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-0.5 break-words text-sm text-[var(--foreground)]">{value}</p>
    </div>
  );
}

export default async function TicketDetailPage(props: { params: Promise<{ ref: string }> }) {
  const { ref } = await props.params;
  const supabase = await createServerClient();

  const { data: ticketData, error } = await supabase
    .from('tickets')
    .select('ref, subject, description, request_kind, capability, tier, client_status, priority, build_state, evidence, scope')
    .eq('ref', ref)
    .single();

  if (error || !ticketData) notFound();
  const ticket = ticketData as Ticket;

  // Every agentic_item that references this ticket.
  const { data: itemsData } = await supabase
    .from('agentic_items')
    .select('id, title, status')
    .eq('ticket_ref', ticket.ref)
    .order('created_at', { ascending: true });

  const items = (itemsData ?? []) as LinkedItem[];
  const priority = ticket.priority ? TICKET_PRIORITY_CONFIG[ticket.priority] : undefined;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-3 text-sm text-[var(--muted-foreground)]">
        <Link href="/tickets" className="hover:text-[var(--foreground)]">Tickets</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono font-medium text-[var(--foreground)]">{ticket.ref}</span>
      </div>

      {/* ── Header card ── */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-[6px] bg-indigo-100 px-2 py-0.5 font-mono text-sm font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {ticket.ref}
          </span>
          {priority && (
            <span
              className="inline-flex rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: priority.bg, color: priority.text }}
            >
              {priority.label}
            </span>
          )}
          {ticket.client_status && (
            <span className="rounded-[8px] border border-[var(--border)] px-2.5 py-1 text-xs font-medium">
              {ticket.client_status}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-base font-semibold sm:text-lg">{ticket.subject ?? ticket.ref}</h1>
        {ticket.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted-foreground)]">
            {ticket.description}
          </p>
        )}
      </div>

      {/* ── Ticket fields ── */}
      <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {ticket.capability && <Field label="Capability" value={ticket.capability} />}
          {ticket.tier && <Field label="Tier" value={ticket.tier} />}
          {ticket.priority && <Field label="Priority" value={ticket.priority} />}
          {ticket.client_status && <Field label="Client status" value={ticket.client_status} />}
          {ticket.build_state && <Field label="Build state" value={ticket.build_state} />}
          {ticket.request_kind && <Field label="Request kind" value={ticket.request_kind} />}
          {ticket.scope && <Field label="Scope" value={ticket.scope} />}
        </div>
        {ticket.evidence && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Evidence</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
              {ticket.evidence}
            </p>
          </div>
        )}
      </div>

      {/* ── Linked agentic items ── */}
      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Linked items</h2>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
            {items.length} linked item{items.length === 1 ? '' : 's'}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
            No agentic items reference this ticket yet.
          </p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              const sid = item.id.substring(0, 8).toUpperCase();
              const statusLabel = item.status ? (STATUS_LABELS[item.status] ?? item.status) : '—';
              return (
                <Link
                  key={item.id}
                  href={`/pipeline/${item.id}`}
                  className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 transition-colors hover:border-[var(--primary)]"
                >
                  <span className="font-mono text-[11px] font-bold text-[var(--primary)]">{sid}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.title ?? '(untitled)'}</span>
                  <span className="shrink-0 rounded-[6px] border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                    {statusLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
