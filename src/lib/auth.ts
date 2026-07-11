export type UserRole = 'operator' | 'approver';

const ROLE_MAP: Record<string, UserRole> = {
  '8a597e19-ae2a-4c69-a830-93f3af8ca346': 'operator',  // Scott Myers
  '3d638004-d154-4e85-b16c-3b004631aaa5': 'approver',  // Brian Guss
  '0491e139-cdf6-4c7f-a5a9-f90bc06b8612': 'operator',  // Etta Wilson (PM — see-all + edit)
};

const NAME_MAP: Record<string, string> = {
  '8a597e19-ae2a-4c69-a830-93f3af8ca346': 'Scott Myers',
  '3d638004-d154-4e85-b16c-3b004631aaa5': 'Brian Guss',
  '0491e139-cdf6-4c7f-a5a9-f90bc06b8612': 'Etta Wilson',
};

// Stable short key per user, used for ownership filtering / the pipeline "Mine" toggle.
const KEY_MAP: Record<string, string> = {
  '8a597e19-ae2a-4c69-a830-93f3af8ca346': 'scott',
  '3d638004-d154-4e85-b16c-3b004631aaa5': 'brian',
  '0491e139-cdf6-4c7f-a5a9-f90bc06b8612': 'etta',
};

export function getUserRole(uid: string): UserRole | null {
  return ROLE_MAP[uid] ?? null;
}

export function getUserName(uid: string): string {
  return NAME_MAP[uid] ?? 'Unknown';
}

export function getUserKey(uid: string): string | null {
  return KEY_MAP[uid] ?? null;
}

export function isOperator(uid: string): boolean {
  return ROLE_MAP[uid] === 'operator';
}

export function isApprover(uid: string): boolean {
  return ROLE_MAP[uid] === 'approver';
}
