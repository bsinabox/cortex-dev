'use server';

import { createServiceClient, createServerClient } from '@/lib/supabase/server';
import { isOperator, getUserRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

type ActionResult = {
  ok: boolean;
  error?: string;
};

async function getAuthUser() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

export async function approveItem(itemId: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const role = getUserRole(user.id);
  if (!role) return { ok: false, error: 'Unauthorized' };

  const supabase = await createServiceClient();

  // Get current item status
  const { data: item } = await supabase
    .from('agentic_items')
    .select('id, status, title')
    .eq('id', itemId)
    .single();

  if (!item) return { ok: false, error: 'Item not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = item as any;

  // Determine target status based on current status
  let targetStatus: string;
  switch (row.status) {
    case 'human_review':
      targetStatus = 'approved';
      break;
    case 'testing_in_dev':
      targetStatus = 'promoting';
      break;
    case 'promotion_review':
      targetStatus = 'promoting';
      break;
    case 'design_review_hold':
      targetStatus = 'approved';
      break;
    default:
      return { ok: false, error: `Cannot approve item in status: ${row.status}` };
  }

  // Attempt status transition (trigger-enforced)
  const { data: updated, error: updateErr } = await supabase
    .from('agentic_items')
    .update({
      status: targetStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', itemId)
    .select('id');

  if (updateErr) return { ok: false, error: updateErr.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!updated || (updated as any[]).length === 0) {
    return { ok: false, error: `Transition ${row.status} → ${targetStatus} rejected by DB trigger` };
  }

  // Log approval message
  const { error: msgErr } = await supabase.from('agentic_messages').insert({
    item_id: itemId,
    author: 'human',
    message_type: 'approval',
    content: `Approved via Cortex Dev (${row.status} → ${targetStatus})`,
  } as Record<string, unknown>);

  if (msgErr) {
    console.error('[approveItem] Message insert failed:', msgErr.message);
  }

  revalidatePath('/pipeline');
  revalidatePath('/approvals');
  return { ok: true };
}

export async function requestChanges(itemId: string, feedback: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const role = getUserRole(user.id);
  if (!role) return { ok: false, error: 'Unauthorized' };

  const supabase = await createServiceClient();

  const { data: item } = await supabase
    .from('agentic_items')
    .select('id, status')
    .eq('id', itemId)
    .single();

  if (!item) return { ok: false, error: 'Item not found' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = item as any;

  // Request changes sends back to designing (from human_review/design_review_hold)
  // or to approved (from testing_in_dev — re-enters build cycle)
  let targetStatus: string;
  switch (row.status) {
    case 'human_review':
    case 'design_review_hold':
      targetStatus = 'designing';
      break;
    case 'testing_in_dev':
      targetStatus = 'approved'; // re-enter build cycle
      break;
    default:
      return { ok: false, error: `Cannot request changes on status: ${row.status}` };
  }

  const { data: updated, error: updateErr } = await supabase
    .from('agentic_items')
    .update({ status: targetStatus } as Record<string, unknown>)
    .eq('id', itemId)
    .select('id');

  if (updateErr) return { ok: false, error: updateErr.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!updated || (updated as any[]).length === 0) {
    return { ok: false, error: `Transition ${row.status} → ${targetStatus} rejected` };
  }

  // Log feedback message
  const { error: msgErr } = await supabase.from('agentic_messages').insert({
    item_id: itemId,
    author: 'human',
    message_type: 'design',
    content: `Changes requested via Cortex Dev:\n\n${feedback}`,
  } as Record<string, unknown>);

  if (msgErr) {
    console.error('[requestChanges] Message insert failed:', msgErr.message);
  }

  revalidatePath('/pipeline');
  revalidatePath('/approvals');
  return { ok: true };
}

export async function cancelItem(itemId: string, reason: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user || !isOperator(user.id)) {
    return { ok: false, error: 'Operator access required' };
  }

  const supabase = await createServiceClient();

  const { data: updated, error: updateErr } = await supabase
    .from('agentic_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    } as Record<string, unknown>)
    .eq('id', itemId)
    .select('id');

  if (updateErr) return { ok: false, error: updateErr.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!updated || (updated as any[]).length === 0) {
    return { ok: false, error: 'Cancel transition rejected' };
  }

  revalidatePath('/pipeline');
  revalidatePath('/approvals');
  return { ok: true };
}

export async function retryJob(jobId: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user || !isOperator(user.id)) {
    return { ok: false, error: 'Operator access required' };
  }

  const supabase = await createServiceClient();

  const { data: updated, error: updateErr } = await supabase
    .from('agentic_jobs')
    .update({ status: 'queued' } as Record<string, unknown>)
    .eq('id', jobId)
    .select('id');

  if (updateErr) return { ok: false, error: updateErr.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!updated || (updated as any[]).length === 0) {
    return { ok: false, error: 'Job retry transition rejected' };
  }

  revalidatePath('/pipeline');
  return { ok: true };
}
