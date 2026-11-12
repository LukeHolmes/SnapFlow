# SnapFlow GxP Evidence Backend — Design (DRAFT)

> **Status:** Design-only. **Not implemented.** No Supabase project has been provisioned from this repo.
>
> **Audience:** Luke Holmes, validation/QA pilot stakeholders.  
> **Regulatory framing:** 21 CFR Part 11, EU GMP Annex 11, ALCOA+ (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available).  
> **Part 11 scope (pilot):** Formal Part 11–style controls apply to the **cloud evidence module** only; the wider SnapFlow desktop remains a supporting system in the customer’s validated stack.  
> **Hosting (pilot):** Supabase **Free** tier, org *The Holmes Syndicate*, region **`eu-central-1`** (Frankfurt).  
> **Architecture (pilot):** **Hybrid** — Supabase (Postgres, Storage, Auth) + existing Node **`/v1` BFF**.  
> **Desktop principle (unchanged):** Capture, OCR, PII detection, and local search remain **local-first** with **zero runtime dependency** on cloud; evidence sync is **opt-in** and tier-gated.

---

## 1. Domain model

### 1.1 Tenancy and identity

| Entity | Purpose |
|--------|---------|
| **Organisation (tenant)** | Legal/customer boundary; all RLS keys off `organisation_id`. |
| **User** | Human actor; **pilot:** Google / GitHub via Supabase Auth; **later:** corporate SSO. |
| **Membership** | `(organisation_id, user_id, role)` — roles: `tester`, `reviewer`, `qa_approver`, `admin`. |
| **Audit identity** | Every cloud row stores `created_by_user_id` + server `created_at`; client-supplied user id is never trusted alone. |

### 1.2 Validation objects

| Entity | Purpose |
|--------|---------|
| **Project / system** | Validated system under test (e.g. LIMS module, MES screen flow). |
| **Test protocol (script)** | Versioned document: scope, GxP classification, linked SOP/training refs. |
| **Test step** | Ordered step within a protocol; expected result text; optional link to change record. |
| **Change record (CR)** | IT change ticket / CC number; gates which protocol version applies in a window. |

### 1.3 Evidence artefacts

| Entity | Purpose |
|--------|---------|
| **Evidence item** | One logical piece of proof: links **local capture id** (UUID), metadata (tag, timestamps, hashes), and **blob refs**. **Must** reference a **test step** *or* a **change record** (CR is not mandatory on every item). |
| **Evidence version** | **Desktop:** immutable local generations (`original`, `processed`, `redacted`). **Cloud (pilot):** ingest **`redacted` only** — no original/processed PNGs in Supabase Storage; local original hash may be stored in metadata for traceability. |
| **Evidence pack** | Bundle for review/export: selected items + manifest hash + status (`draft` → `submitted` → `reviewed` → `approved`). |
| **Deviation / defect** | Non-conformance linked to step/item; workflow state; may reference evidence items. |
| **Review / approval** | Part 11-style signature records on pack or deviation; bound to content hash at sign time. |

### 1.2 ER diagram (logical)

```mermaid
erDiagram
  organisations ||--o{ memberships : has
  users ||--o{ memberships : has
  organisations ||--o{ projects : owns
  projects ||--o{ test_protocols : contains
  test_protocols ||--o{ test_steps : contains
  projects ||--o{ change_records : tracks
  test_steps ||--o{ evidence_items : documents
  change_records ||--o{ evidence_items : governs
  evidence_items ||--o{ evidence_versions : has
  evidence_items ||--o{ deviations : may_raise
  evidence_packs ||--o{ evidence_pack_items : contains
  evidence_items ||--o{ evidence_pack_items : included
  evidence_packs ||--o{ signatures : signed
  organisations ||--o{ audit_log : append_only
  evidence_items ||--o{ audit_log : references
```

---

## 2. Evidence integrity

| Control | Design |
|---------|--------|
| **Content hashing** | SHA-256 of each **cloud-stored** object (pilot: redacted PNG only). Hash computed **server-side** on upload (stream hash). Desktop may send `local_original_sha256` (no blob) for linkage to the local immutable original. |
| **Trusted time** | `recorded_at` = `now()` at ingest (Postgres `timestamptz`); `client_captured_at` stored separately, labelled non-authoritative. |
| **Attribution** | `created_by_user_id` from JWT; desktop local captures keep `local_user_ref` until sync binds to cloud user. |
| **Immutable originals** | **Local only:** original PNG + hash never overwritten on disk. **Cloud:** no original object; audit records ingest of redacted derivative only. |
| **Redaction lineage** | Desktop redaction pipeline links redacted → local original; cloud `redacted` row stores `local_original_sha256` (and optional `local_capture_id`) in metadata. |
| **Audit hash chain** | Each `audit_log` row: `payload_hash`, `prev_hash`, `chain_hash = SHA256(prev_hash \|\| canonical_json(payload))`. Genesis row uses fixed `prev_hash = '0'`. |
| **Anchoring (optional, later)** | Daily Merkle root of `chain_hash` values stored off-box (e.g. object metadata, third-party timestamp service) for pilot+; not required for MVP demo. |

---

## 3. Append-only audit trail

**Table:** `audit_log` (organisation-scoped).

| Column | Notes |
|--------|------|
| `event_type` | e.g. `evidence.created`, `version.ingested`, `pack.submitted`, `signature.applied` |
| `entity_type` / `entity_id` | Pointer to business record |
| `actor_user_id` | Who |
| `reason` | **Why** (required for GxP corrections and manual overrides) |
| `metadata` | JSON (diff-safe, no PII blobs) |
| `prev_hash`, `chain_hash` | Integrity chain |

**Enforcement (Postgres):**

- `REVOKE UPDATE, DELETE` on `audit_log` from application roles.
- `BEFORE UPDATE OR DELETE` trigger → `RAISE EXCEPTION`.
- Inserts only via `SECURITY DEFINER` function `append_audit_event(...)` that computes chain fields.

**Corrections:** Never `UPDATE` business facts. Publish a **superseding** record (`supersedes_id`, `correction_reason`) and a new audit event. UI shows effective record as latest non-superseded.

Draft DDL patterns live in `docs/design/evidence-schema.draft.sql` (**not applied**).

---

## 4. Electronic signatures (Part 11 — pilot scope)

| Topic | Pilot MVP | Later |
|-------|-----------|-------|
| **Re-authentication** | Password / MFA step via Supabase Auth (Google/GitHub-linked account) immediately before sign action | Corporate SSO + hardware key, step-up policies |
| **Meaning** | Enum: `author`, `reviewer`, `approver` stored on `signatures` row | Configurable **display labels** per organisation SOP |
| **Manifest binding** | `signed_payload_hash` = SHA-256 of canonical pack manifest JSON at sign time | Full CFR11 compliant manifest + printed PDF embed |
| **Display** | Pack PDF footer: name, meaning, UTC time, hash short-id | Legally reviewed label text |
| **Non-repudiation** | Session + audit chain + hash; not qualified eIDAS | Legal review for EU QP sign-off |

Desktop **sign** action calls API → server records signature row + audit event; does not store signature bitmap in MVP.

---

## 5. Row Level Security, storage, URLs

### 5.1 RLS (Postgres)

- Enable RLS on all tenant tables.
- JWT claim `organisation_id` (set via custom claim or `memberships` lookup in policy).
- Policies:
  - **tester:** CRUD own draft evidence; read published protocols.
  - **reviewer:** read packs assigned; add review signatures.
  - **qa_approver:** approve packs; read audit.
  - **admin:** manage membership; no bypass of audit append-only.

Service role used only for **background jobs** (hash verify, export render), with narrow RPCs.

### 5.2 Storage layout (Supabase Storage)

```
evidence/
  {organisation_id}/
    {evidence_item_id}/
      {version_id}_redacted.png    # pilot: only redacted objects in cloud
exports/
  {organisation_id}/
    {pack_id}/
      manifest.json
      evidence-pack.pdf
```

- **Private buckets**; no public ACL.
- Upload via **signed upload URL** (short TTL) or authenticated `storage.from().upload()` from desktop with user JWT.
- Download for reviewers: **signed download URL** (e.g. 15–60 minutes), logged in `audit_log`.
- Align with existing SnapFlow pattern: separate **share-link secret** for cross-system URLs if Node proxy remains (see §8).

### 5.3 Signed URL rules

- HMAC parameters: `exp`, `object_path`, `organisation_id`, optional `purpose=review|export`.
- Reject expired / tampered links; log access attempt (without blob body).

---

## 6. Retention, legal hold, export, verification

| Topic | Design |
|-------|--------|
| **Retention** | **Per-organisation** policy; **default: retain indefinitely** (no automatic purge). |
| **Legal hold** | `legal_hold` on organisation/project/item — **blocks all deletion** and scheduled purge. |
| **Export** | **SnapFlow generic PDF evidence pack** (pilot) + **JSON/CSV manifest** (hashes, versions, signatures, audit excerpt). |
| **Verification tool** | CLI or admin UI: re-download objects, recompute SHA-256, compare manifest; verify audit chain from genesis. |
| **Purge** | Soft-delete metadata + storage lifecycle; prohibited when hold active; purge itself is an audit event. |

---

## 7. Sync model (desktop SQLite → cloud)

| Aspect | Rule |
|--------|------|
| **Queue** | Local `sync_outbox` table: payload idempotency key = `local_capture_id` + `operation` + `content_hash`. |
| **Offline** | Queue persists; retry with exponential backoff; no user blocking. |
| **Conflict** | **Last-write-wins on metadata** only for non-GxP fields (title, tag); **evidence versions are append-only** — never merge binary conflicts. |
| **Never leaves device (default)** | Full **OCR text** (especially when PII flagged); **unredacted** and **original** images. |
| **What syncs when opted in (pilot)** | **Redacted PNG only** + hashes + minimal metadata; **no cloud originals**. **Cloud AI is off by default** for GxP evidence records (no auto-tag / diff summary on evidence ingest). |
| **FTS5** | Stays local; cloud search uses Postgres `tsvector` on **non-PII** metadata fields only. |

Maps to existing desktop: cloud sync opt-in, `piiRedactedApplied`, `auth_sessions` bearer, refresh rotation.

---

## 8. API: Node `/v1` BFF + Supabase (decided)

**Pilot architecture:** **Hybrid** — Supabase hosts Postgres, Storage, and Auth (`eu-central-1`); the existing Node service remains the **BFF** for evidence ingest, signing, export, and non-GxP features (deliver, optional product AI).

| Approach | Pros | Cons |
|----------|------|------|
| **A. Supabase direct only** | Simpler ops | Does not reuse Express evidence/hash pipeline; rejected for pilot |
| **B. Node-only DB** | Single codepath | Loses RLS-native reviewer UI; rejected |
| **C. Hybrid (chosen)** | Desktop → **Node BFF** for GxP evidence; **Supabase** for data plane + future reviewer UI | Requires clear boundaries between BFF and RLS |

- **Supabase Auth** for pilot sign-in (**Google / GitHub**); org invites via `memberships`; corporate SSO deferred.
- Transition mapping: `user_auth_links(supabase_user_id, snapflow_account_id)` while desktop may still use `auth_sessions` for non-evidence APIs.
- New routes (illustrative): `POST /v1/evidence/ingest`, `POST /v1/evidence/packs`, `POST /v1/evidence/sign`, `GET /v1/evidence/packs/:id/export`.
- Read-only reviewer UI (later) can use Supabase client + RLS directly.

---

## 9. Supabase Free tier (verified Nov 2025)

Sources: [Supabase pricing](https://supabase.com/pricing), [billing guide](https://supabase.com/docs/guides/platform/billing-on-supabase), [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

| Quota | Free tier (per active project) |
|-------|--------------------------------|
| Database size | **500 MB** |
| File storage | **1 GB** |
| Egress | **5 GB** / month (org-level aggregation) |
| MAU (Auth) | **50,000** |
| Active free projects | **2** per owner/admin (paused projects don’t count) |
| Pausing | Auto-pause after **~1 week** of low DB activity; restorable ~**1 year** |
| Max upload (single file) | **50 MB** |
| Backups / PITR | **Not** on Free |

**Pilot fit:** Redacted-only uploads and indefinite retention (metadata-heavy) fit if images are **compressed** and originals remain **local only**. Risk: **1 GB storage** and **50 MB** upload cap — keep evidence PNGs redacted and reasonably sized.

**Likely paid triggers (flag only, no decision):** Storage > 1 GB, need **non-pausing** uptime, **PITR/backups**, **corporate SSO**, >50 MB captures, or regulatory demand for dedicated compute/Enterprise BAA.

---

## 10. Phased delivery

### Phase 0 — Pilot MVP (credible demo)

1. Organisation + roles + one protocol with steps.  
2. Desktop: capture → PII redact → diff → attach to a **test step** *or* **change record** (CR optional).  
3. Opt-in sync: upload **redacted** PNG only; server stores hash + trusted timestamp (**no cloud originals**, **no cloud AI** on evidence).  
4. Build **evidence pack** (draft); **reviewer** signature with re-auth.  
5. Export **SnapFlow generic** PDF + JSON manifest; run **verify** script on sample pack.

### Phase 1 — Hardening

Audit chain verification UI, legal hold, deviation workflow, anchoring, reviewer web app (Supabase + RLS).

### Phase 2 — Scale / compliance

Qualified validation package, SSO, automated regression evidence from CI, multi-site orgs.

---

## Decisions (12 Nov 2026, pilot)

Luke accepted the recommended defaults for the former open questions. These are binding for pilot design unless explicitly revised:

1. **Part 11 scope:** Controls apply to the **cloud evidence module only** (not the entire desktop product).  
2. **Cloud images:** Pilot uploads **redacted images only** — **no cloud originals**.  
3. **Sign-in:** **Google / GitHub** for pilot; **corporate SSO** later.  
4. **Signatures:** Meaning codes **`author` / `reviewer` / `approver`**; display **labels** configurable per org later.  
5. **Linkage:** Each evidence item must link to a **test step** *or* a **change record** (CR **not** mandatory on every item).  
6. **Retention:** Set **per organisation**; default **retain indefinitely**; **legal hold** blocks deletion.  
7. **Stack:** **Hybrid** — Supabase (Postgres / Storage / Auth) + Node **`/v1` BFF**.  
8. **Region:** **`eu-central-1`**.  
9. **Cloud AI:** **Off by default** for GxP evidence records (no proxy tagging/summary on evidence ingest).  
10. **Export PDF:** **Generic SnapFlow template** for now (customer templates later).

---

## Related files

- Draft SQL (not applied): `docs/design/evidence-schema.draft.sql`
- Current architecture: `docs/ARCHITECTURE.md`
- Privacy / data flow: `docs/PRIVACY.md`
