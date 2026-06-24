import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole, getUserName } from '@/lib/auth';
import { sendPushNotification } from '@/lib/push';

export async function POST() {
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

    const name = getUserName(user.id);

    const result = await sendPushNotification({
      title: 'Cortex Push Test',
      body: `Hey ${name}, push notifications are working!`,
      url: '/pipeline',
      tag: 'push-test',
      priority: 'normal',
      user_ids: [user.id],
    });

    return NextResponse.json({ status: 'ok', sent: result.sent, total: result.total });
  } catch (err) {
    console.error('Push test error:', err);
    return NextResponse.json({ error: 'Push test failed' }, { status: 500 });
  }
}
