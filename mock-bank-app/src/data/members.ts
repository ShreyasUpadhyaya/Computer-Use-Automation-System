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
