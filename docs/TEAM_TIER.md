# Team tier (v1.1.0 foundation)

SnapFlow Team adds **shared capture libraries**, **seat-based membership**, and **server-authoritative** entitlements on top of Pro cloud sync. This document describes what ships in v1.1.0 and what is intentionally deferred.

## Backend

### Data model (Postgres/SQLite via `buildSchema`)

- `teams` — name, `workspace_id` (`team_<uuid>`), owner, `seat_limit` (default from `TEAM_DEFAULT_SEAT_LIMIT`, dev default 5).
- `team_members` — `owner` | `admin` | `member`.
- `team_invites` — email, role, `token_hash` (SHA-256), expiry, single-use `used_at`.
- `team_library` — shared capture metadata; blobs stay under the sharer's `account_id`.

Schema is applied idempotently on boot (`CREATE TABLE IF NOT EXISTS`). No separate migration runner in dev/test.

### HTTP API

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/v1/teams` | Team plan on **account** required; one team per creator in this foundation. |
| `GET` | `/v1/teams/me` | Team, role, members, seat usage. |
| `PATCH` | `/v1/teams/:id` | Rename (owner/admin). |
| `POST` | `/v1/teams/:id/invites` | Returns `inviteUrl` (no email). |
| `POST` | `/v1/teams/invites/accept` | Body `{ token }`; enforces seats + single-use + expiry. |
| `DELETE` | `/v1/teams/:id/members/me` | Leave (owner must transfer first — not implemented). |
| `DELETE` | `/v1/teams/:id/members/:accountId` | owner/admin remove member. |
| `GET` | `/v1/teams/:id/library` | List shared captures. |
| `POST` | `/v1/teams/:id/library` | Share metadata; requires blob uploaded for sharer. |
| `GET` | `/v1/teams/:id/library/:captureId/signed-url` | **Members only**; mints team-scoped HMAC URL. |
| `GET` | `/v1/teams/:id/captures/:ownerAccountId/:captureId.png` | Valid sig **and** bearer + membership (non-members → 403). |

### Entitlements

`GET /v1/entitlements` uses **effective tier**: Team members on Pro/Free accounts inherit `tier: team` and `sharedLibrary: true` while `accountTier` reflects billing.

Sync, AI, and integration gates use effective tier server-side.

### Billing (stub only)

- `POST /v1/billing/team/checkout-stub` — placeholder JSON; **no Stripe/Paddle**.
- Dev tier changes: `POST /v1/billing/webhook` with `{ accountId, tier: "team" }` or `POST /auth/token` with `"tier":"team"`.

## Desktop

- **Account → Team** — create team, copy invite link, member list, leave.
- **History** — **Share to team** (Team tier + cloud sync + backend token); uploads blob then registers library row.
- Client mirror adds `sharedLibrary` on the Team tier row in `src/main/entitlements` (server remains authoritative).

## Deferred (not in v1.1.0 foundation)

- Real checkout, seat purchases, and per-team `seat_limit` updates from billing webhooks.
- Email delivery of invites; SSO; ownership transfer; multiple teams per user.
- Dedicated Team library browser UI (backend list API exists; use Search Library workspace + server search as follow-up).
- Public team URLs without bearer (current team capture URLs require auth + membership).

## Dev smoke

```bash
cd backend && npm run dev
curl -s -X POST http://localhost:3001/auth/token -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","tier":"team"}'
# Use token for /v1/teams, invites, and library calls (see backend/tests/teams.test.ts).
```
