# SnapFlow GxP evidence — Supabase (pilot)

Versioned SQL for the **cloud evidence module** (`eu-central-1`). Design: [`docs/EVIDENCE_BACKEND_DESIGN.md`](../docs/EVIDENCE_BACKEND_DESIGN.md).

## Migrations

| File | Contents |
|------|----------|
| `20261112100000_extensions.sql` | `pgcrypto` |
| `20261112100100_tenancy_and_validation.sql` | Organisations, memberships, projects, protocols, steps, change records |
| `20261112100200_evidence_and_signatures.sql` | Evidence items/versions/packs, Part 11 signatures |
| `20261112100300_audit_immutability_legal_hold.sql` | Append-only `audit_log`, hash chain, legal hold |
| `20261112100400_rls_policies.sql` | RLS on all tenant tables |
| `20261112100500_storage_evidence_bucket.sql` | Private `evidence` bucket + object policies (no `ALTER` on `storage.objects`) |
| `20261112100600_advisor_hardening.sql` | Private definer schema, advisor fixes (apply after `005` on hosted) |

**Do not apply to the hosted project until Luke approves.**

**Hosted SnapFlow (if `000000`–`004` already applied, `005` failed):** apply only:

1. `20261112100500_storage_evidence_bucket.sql`
2. `20261112100600_advisor_hardening.sql`

Fresh environments: apply `000000` … `006000` in order. Skip `ci-local-stub.sql` on hosted.

`supabase/tests/ci-local-stub.sql` is **CI/local only** — stubs `auth` and `storage` for plain Postgres. **Skip on hosted Supabase** (platform provides these).

## Storage layout

Bucket `evidence` (private). Object path:

```
{organisation_id}/{evidence_item_id}/{version_id}_redacted.png
```

## Local verification

```bash
cd backend
export EVIDENCE_DATABASE_URL=postgres://snapflow:snapflow@127.0.0.1:5432/snapflow_evidence_test
docker run --rm -d -p 5432:5432 -e POSTGRES_USER=snapflow -e POSTGRES_PASSWORD=snapflow -e POSTGRES_DB=snapflow_evidence_test postgres:16
npm run test:evidence-db
```

Manifest verifier:

```bash
npx tsx backend/scripts/verify-evidence-manifest.ts path/to/manifest.json
```

## Hosted project checklist (manual)

1. Link Supabase project **SnapFlow** (`nrkgzsrgqnhbiamknjws`, Frankfurt).
2. Run migrations `20261112100000` … `20261112100500` in order (not `ci-local-stub.sql`).
3. Confirm bucket `evidence` exists and is **private**.
4. Enable Google + GitHub auth providers in Supabase Auth (pilot sign-in).
5. Do **not** commit API keys or service role keys to this repo.
