'use server';

import { createServiceClient, createServerClient } from '@/lib/supabase/server';
import { isOperator } from '@/lib/auth';

type VpsCommandResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
};

export async function executeVpsCommand(
  command: string,
  args: string[],
  workingDirectory: string = '/root/repos/bs-box-web',
  timeoutSeconds: number = 30
): Promise<VpsCommandResult> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || !isOperator(user.id)) {
    return { ok: false, error: 'Unauthorized — operator access required' };
  }

  const supabase = await createServiceClient();
  const commandId = `cmd_cortex_${Date.now().toString(36)}`;

  const { error: insertErr } = await supabase
    .from('vps_commands')
    .insert({
      command_id: commandId,
      command_type: 'exec',
      command,
      args,
      working_directory: workingDirectory,
      timeout_seconds: timeoutSeconds,
      requested_by: 'hub-scott',
    } as Record<string, unknown>);

  if (insertErr) {
    return { ok: false, error: `Insert failed: ${insertErr.message}` };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const { data, error: readErr } = await supabase
      .from('vps_commands')
      .select('status, exit_code, stdout, stderr')
      .eq('command_id', commandId)
      .single();

    if (readErr || !data) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    if (row.status === 'complete' || row.status === 'failed' || row.status === 'timeout' || row.status === 'rejected') {
      return {
        ok: row.status === 'complete' && row.exit_code === 0,
        stdout: row.stdout ?? undefined,
        stderr: row.stderr ?? undefined,
        exit_code: row.exit_code ?? undefined,
        error: row.status === 'rejected' ? 'Command rejected by daemon' : undefined,
      };
    }
  }

  return { ok: false, error: 'Command timed out waiting for result' };
}

export async function checkServiceStatus(serviceName: string): Promise<{ active: boolean; status: string }> {
  const result = await executeVpsCommand('systemctl', ['is-active', serviceName], '/tmp');
  if (!result.ok && !result.stdout) {
    return { active: false, status: result.error ?? 'unknown' };
  }
  const status = (result.stdout ?? '').trim();
  return { active: status === 'active', status };
}

export async function getOpsLog(): Promise<Array<Record<string, unknown>>> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return [];

  const supabase = await createServiceClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('agentic_ops_log')
    .select('id, kind, severity, title, detail, status, item_id, created_at')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []) as Array<Record<string, unknown>>;
}
