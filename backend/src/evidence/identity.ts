import { evidenceQuery } from './pool';
import { evidenceTestDoubles } from './test-doubles';

export type EvidenceIdentity = {
  snapflowAccountId: string;
  organisationId: string;
  supabaseUserId: string;
  role: 'tester' | 'reviewer' | 'qa_approver' | 'admin';
};

const ROLE_ORDER = ['tester', 'reviewer', 'qa_approver', 'admin'] as const;

export function roleAtLeast(
  role: EvidenceIdentity['role'],
  minimum: EvidenceIdentity['role'],
): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

export async function loadIdentity(snapflowAccountId: string): Promise<EvidenceIdentity | null> {
  if (process.env.EVIDENCE_TEST_MOCK === '1' && evidenceTestDoubles.loadIdentity) {
    return evidenceTestDoubles.loadIdentity(snapflowAccountId);
  }
  const r = await evidenceQuery<{
    snapflow_account_id: string;
    organisation_id: string;
    supabase_user_id: string;
    role: EvidenceIdentity['role'];
  }>(
    `SELECT snapflow_account_id, organisation_id, supabase_user_id, role
     FROM public.evidence_bff_identities WHERE snapflow_account_id = $1`,
    [snapflowAccountId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    snapflowAccountId: row.snapflow_account_id,
    organisationId: row.organisation_id,
    supabaseUserId: row.supabase_user_id,
    role: row.role,
  };
}

export async function assertOrgMembership(
  identity: EvidenceIdentity,
  organisationId: string,
): Promise<void> {
  if (identity.organisationId !== organisationId) {
    throw Object.assign(new Error('organisation mismatch'), { status: 403, code: 'org_mismatch' });
  }
  const r = await evidenceQuery(
    `SELECT 1 FROM public.memberships WHERE organisation_id = $1 AND user_id = $2`,
    [organisationId, identity.supabaseUserId],
  );
  if (!r.rowCount) {
    throw Object.assign(new Error('not a member of organisation'), { status: 403, code: 'not_member' });
  }
}
