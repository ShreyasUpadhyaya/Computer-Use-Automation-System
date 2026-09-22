export interface SubAccount {
  id: string;
  type: 'Savings' | 'Checking' | 'Certificate';
  balanceCents: number;
}

export interface Member {
  memberId: string;
  fullName: string;
  status: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  subAccounts: SubAccount[];
}

// Synthetic demo data only — no real PII. Deliberately small and fixed so
// discovery + replay runs are reproducible.
export const members: Member[] = [
  {
    memberId: '12345',
    fullName: 'Dana Whitfield',
    status: 'ACTIVE',
    subAccounts: [
      { id: 'SAV-001', type: 'Savings', balanceCents: 482350 },
      { id: 'CHK-001', type: 'Checking', balanceCents: 121004 },
    ],
  },
  {
    memberId: '67890',
    fullName: 'Marcus Ionescu',
    status: 'ACTIVE',
    subAccounts: [{ id: 'SAV-002', type: 'Savings', balanceCents: 15000 }],
  },
  {
    memberId: '11111',
    fullName: 'Priya Anand',
    status: 'RESTRICTED',
    subAccounts: [{ id: 'SAV-003', type: 'Savings', balanceCents: 998200 }],
  },
];

export function findMember(memberId: string): Member | undefined {
  return members.find((m) => m.memberId === memberId);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface PendingSubAccount {
  confirmationToken: string;
  memberId: string;
  accountType: SubAccount['type'];
  openingDepositCents: number;
  createdAt: number;
}

// Simple in-memory staging area for the "form -> confirm" two-step flow.
// A real system would scope this to a server-side session; a Map keyed by
// a random token is enough to demonstrate the confirmation-step pattern.
const pendingConfirmations = new Map<string, PendingSubAccount>();

export function stagePendingSubAccount(
  memberId: string,
  accountType: SubAccount['type'],
  openingDepositCents: number,
): PendingSubAccount {
  const pending: PendingSubAccount = {
    confirmationToken: `tok_${Math.random().toString(36).slice(2, 10)}`,
    memberId,
    accountType,
    openingDepositCents,
    createdAt: Date.now(),
  };
  pendingConfirmations.set(pending.confirmationToken, pending);
  return pending;
}

export function getPendingSubAccount(token: string): PendingSubAccount | undefined {
  return pendingConfirmations.get(token);
}

let subAccountSequence = 100;

export function confirmSubAccount(token: string): SubAccount | undefined {
  const pending = pendingConfirmations.get(token);
  if (!pending) return undefined;

  const member = findMember(pending.memberId);
  if (!member) return undefined;

  subAccountSequence += 1;
  const prefix = pending.accountType === 'Savings' ? 'SAV' : pending.accountType === 'Checking' ? 'CHK' : 'CD';
  const subAccount: SubAccount = {
    id: `${prefix}-${subAccountSequence}`,
    type: pending.accountType,
    balanceCents: pending.openingDepositCents,
  };
  member.subAccounts.push(subAccount);
  pendingConfirmations.delete(token);
  return subAccount;
}
