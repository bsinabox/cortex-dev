'use server';

import { createServiceClient, createServerClient } from '@/lib/supabase/server';
import { getUserRole, getUserName } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { ResolutionAction, TriggerType } from '@/lib/learning';

type ActionResult = {
  ok: boolean;
  error?: string;
};

async function getAuthUser() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

/**
 * Approve an item WITH resolution capture for the learning layer.
 * Wraps the existing approve logic and additionally inserts into human_resolution_log.
 */
export async function approveWithResolution(
  itemId: string,
  resolution: {
    trigger_type: TriggerType;
    resolution_action: ResolutionAction;
    resolution_detail: string;
    h_class: string | null;
  }
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const role = getUserRole(user.id);
  if (!role) return { ok: false, error: 'Unauthorized' };

  const supabase = await createServiceClient();
  const userName = getUserName(user.id);

  // Get current item
  const { data: item } = await supabase
    .from('agentic_items')
    .select('id, status, title, work_type, risk_tier, classification_packet, human_stop_count')
    .eq('id', itemId)
    .single();

  if (!item) return { ok: false, error: 'Item not found' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = item as any;

  // Determine target status
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

  // Attempt status transition
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

  // Insert into human_resolution_log
  const packet = row.classification_packet || {};
  const { error: logErr } = await supabase
    .from('human_resolution_log')
    .insert({
      item_id: itemId,
      trigger_type: resolution.trigger_type,
      trigger_h_class: resolution.h_class,
      resolution_action: resolution.resolution_action,
      resolution_detail: resolution.resolution_detail || null,
      item_work_type: row.work_type || null,
      item_risk_tier: row.risk_tier || null,
      item_route: packet.route || null,
      autonomous_actions_consumed: row.autonomous_action_count || 0,
      item_outcome: 'pending',
      created_by: userName,
    } as Record<string, unknown>);

  if (logErr) {
    console.error('[approveWithResolution] Resolution log insert failed:', logErr.message);
    // Non-fatal — the approval itself succeeded
  }

  // Increment human_stop_count
  await supabase
    .from('agentic_items')
    .update({ human_stop_count: (row.human_stop_count || 0) + 1 } as Record<string, unknown>)
    .eq('id', itemId);

  // Log approval message
  await supabase.from('agentic_messages').insert({
    item_id: itemId,
    author: 'human',
    message_type: 'approval',
    content: `Approved via Cortex (${row.status} → ${targetStatus}) | Resolution: ${resolution.resolution_action}${resolution.resolution_detail ? ` — ${resolution.resolution_detail}` : ''}`,
  } as Record<string, unknown>);

  revalidatePath('/pipeline');
  revalidatePath('/approvals');
  revalidatePath('/learning');
  return { ok: true };
}

/**
 * Reject/request changes WITH resolution capture.
 */
export async function rejectWithResolution(
  itemId: string,
  feedback: string,
  resolution: {
    trigger_type: TriggerType;
    resolution_action: ResolutionAction;
    resolution_detail: string;
    h_class: string | null;
  }
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const role = getUserRole(user.id);
  if (!role) return { ok: false, error: 'Unauthorized' };

  const supabase = await createServiceClient();
  const userName = getUserName(user.id);

  const { data: item } = await supabase
    .from('agentic_items')
    .select('id, status, work_type, risk_tier, classification_packet, human_stop_count')
    .eq('id', itemId)
    .single();

  if (!item) return { ok: false, error: 'Item not found' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = item as any;

  let targetStatus: string;
  switch (row.status) {
    case 'human_review':
    case 'design_review_hold':
      targetStatus = 'designing';
      break;
    case 'testing_in_dev':
      targetStatus = 'approved';
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

  // Insert into human_resolution_log
  const packet = row.classification_packet || {};
  const { error: logErr } = await supabase
    .from('human_resolution_log')
    .insert({
      item_id: itemId,
      trigger_type: resolution.trigger_type,
      trigger_h_class: resolution.h_class,
      resolution_action: resolution.resolution_action,
      resolution_detail: resolution.resolution_detail || feedback,
      item_work_type: row.work_type || null,
      item_risk_tier: row.risk_tier || null,
      item_route: packet.route || null,
      autonomous_actions_consumed: row.autonomous_action_count || 0,
      item_outcome: 'pending',
      created_by: userName,
    } as Record<string, unknown>);

  if (logErr) {
    console.error('[rejectWithResolution] Resolution log insert failed:', logErr.message);
  }

  // Increment human_stop_count
  await supabase
    .from('agentic_items')
    .update({ human_stop_count: (row.human_stop_count || 0) + 1 } as Record<string, unknown>)
    .eq('id', itemId);

  // Log feedback message
  await supabase.from('agentic_messages').insert({
    item_id: itemId,
    author: 'human',
    message_type: 'design',
    content: `Changes requested via Cortex (${resolution.resolution_action}):\n\n${feedback}`,
  } as Record<string, unknown>);

  revalidatePath('/pipeline');
  revalidatePath('/approvals');
  revalidatePath('/learning');
  return { ok: true };
}
