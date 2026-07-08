const APPROVER_NAME: Record<string, 'scott' | 'brian'> = {
  '8a597e19-ae2a-4c69-a830-93f3af8ca346': 'scott', // Scott Myers
  '3d638004-d154-4e85-b16c-3b004631aaa5': 'brian', // Brian Guss
};
export function approverName(uid: string): 'scott' | 'brian' | null {
  return APPROVER_NAME[uid] ?? null;
}
type EFResult = { httpOk: boolean; success?: boolean; error?: string; status?: string; promotion_log_id?: string; idempotent?: boolean };
export async function callPromoteEF(route: '' | 'initiate', body: Record<string, unknown>): Promise<EFResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${base}/functions/v1/promote-environment${route ? '/' + route : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, ...json };
}
