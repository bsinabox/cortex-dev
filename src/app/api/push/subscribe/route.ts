import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = getUserRole(user.id);
    if (!role) {
      return NextResponse.json({ error: 'Unknown user' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    if (typeof endpoint !== 'string' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    if (endpoint.length > 2048 || keys.p256dh.length > 256 || keys.auth.length > 256) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }

    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'Endpoint must use HTTPS' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid endpoint URL' }, { status: 400 });
    }

    const { error } = await supabase
      .from('cortex_dev_push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth_key: keys.auth,
          user_agent: request.headers.get('user-agent') ?? null,
          active: true,
          failure_count: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('Push subscription error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ status: 'subscribed' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { endpoint } = body as { endpoint?: string };

    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    if (endpoint.length > 2048) {
      return NextResponse.json({ error: 'endpoint too long' }, { status: 400 });
    }

    const { error } = await supabase
      .from('cortex_dev_push_subscriptions')
      .update({ active: false })
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('Push unsubscribe error:', error);
      return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }

    return NextResponse.json({ status: 'unsubscribed' });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
