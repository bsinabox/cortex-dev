import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth';
import { sendPushNotification, type PushPayload } from '@/lib/push';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = getUserRole(user.id);
    if (role !== 'operator') {
      return NextResponse.json({ error: 'Operator access required' }, { status: 403 });
    }

    const body: PushPayload = await request.json();

    if (!body.title || !body.body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    const result = await sendPushNotification(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ error: 'Push notification failed' }, { status: 500 });
  }
}
