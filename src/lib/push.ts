const EDGE_FUNCTION_PATH = '/functions/v1/push-notify';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  priority?: 'normal' | 'high';
  item_sid?: string;
  user_ids?: string[];
};

export async function sendPushNotification(payload: PushPayload): Promise<{
  sent: number;
  total: number;
  results: Array<{ id: string; status: string; error?: string }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');

  const res = await fetch(`${supabaseUrl}${EDGE_FUNCTION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`push-notify edge function failed (${res.status}): ${text}`);
  }

  return res.json();
}
