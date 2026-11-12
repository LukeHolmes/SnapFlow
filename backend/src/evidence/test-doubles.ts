import type { EvidenceIdentity } from './identity';

/** In-process stubs for route tests when EVIDENCE_TEST_MOCK=1 (never used in production). */
export const evidenceTestDoubles = {
  loadIdentity:
    undefined as ((snapflowAccountId: string) => Promise<EvidenceIdentity | null>) | undefined,
  createEvidenceItem:
    undefined as ((identity: EvidenceIdentity, input: Record<string, unknown>) => Promise<{ id: string }>) | undefined,
  ingestRedactedVersion:
    undefined as ((identity: EvidenceIdentity, itemId: string, input: Record<string, unknown>) => Promise<unknown>) | undefined,
  signPack:
    undefined as ((identity: EvidenceIdentity, packId: string, input: Record<string, unknown>) => Promise<unknown>) | undefined,
};
