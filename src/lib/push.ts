export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  priority?: 'normal' | 'high';
  status?: string;
  item_sid?: string;
  user_ids?: string[];
};

export async function sendPushNotification(payload: PushPayload): Promise<{
  sent: number;
  total: number;
  results: Array<{ id: string; status: string; error?: string }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

  const res = await fetch(`${supabaseUrl}/functions/v1/push-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`push-notify edge function failed (${res.status}):`, text);
    throw new Error(`push-notify failed with status ${res.status}`);
  }

  return await res.json();
}
