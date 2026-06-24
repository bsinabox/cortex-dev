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

    let body: PushPayload;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.title || !body.body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    if (typeof body.title !== 'string' || body.title.length > 200 ||
        typeof body.body !== 'string' || body.body.length > 1000) {
      return NextResponse.json({ error: 'title or body too long' }, { status: 400 });
    }

    if (body.url && (typeof body.url !== 'string' || !body.url.startsWith('/') || body.url.startsWith('//') || body.url.length > 500)) {
      return NextResponse.json({ error: 'url must be a relative path' }, { status: 400 });
    }

    if (body.user_ids) {
      if (!Array.isArray(body.user_ids) || body.user_ids.length > 100 ||
          !body.user_ids.every((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
        return NextResponse.json({ error: 'Invalid user_ids' }, { status: 400 });
      }
    }

    const result = await sendPushNotification(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ error: 'Push notification failed' }, { status: 500 });
  }
}
