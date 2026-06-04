# SnapFlow Backend

The thin cloud layer (architecture §5): a stateless **modular monolith** providing
authentication, an encrypted OAuth vault, a **metered AI proxy**, server-authoritative
entitlements, and billing. Capture / OCR / search stay on the desktop client — this
backend never bears that load.

## Run

```bash
cd backend
npm install
cp .env.example .env     # optional; sensible dev defaults exist
npm run dev              # http://localhost:3001
npm test                 # headless unit tests
```

Dev uses **SQLite** so it runs with zero external services. Set `DATABASE_URL` to use
the Postgres adapter. `docker-compose up` starts the production-adjacent backing
services (Postgres, Redis, MinIO); Redis/object-storage wiring remains behind the
current store/rate-limit ports.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/health` | — | Liveness |
| POST | `/auth/token` | — | Dev login: email → bearer token (gated by `DEV_LOGIN`; disable in prod) |
| GET  | `/auth/oauth/:provider/start` | — | Begin OAuth login (redirects to Google/GitHub) |
| GET  | `/auth/oauth/:provider/callback` | — | OAuth callback: exchange code → issue bearer |
| GET  | `/v1/search` | ✅ | Server-side Team search across the shared library (Team only) |
| POST | `/v1/deliver` | ✅ | Server-side delivery using the vault token (never sent to the client) |
| GET  | `/v1/entitlements` | ✅ | Server-authoritative tier capabilities |
| POST | `/v1/ai/tag` | ✅ | Metered, tier-gated auto-tagging (Free rejected with 402) |
| PUT/GET/DELETE | `/v1/vault/:destination` | ✅ | Encrypted OAuth credential store (GET returns metadata only) |
| POST | `/v1/billing/webhook` | — | Paddle/Stripe stub → tier update (verify signature in prod) |
| POST | `/v1/sync/push` | ✅ | Upsert capture metadata (LWW); returns the new cursor |
| GET  | `/v1/sync/pull` | ✅ | Changed records since a cursor (workspace-scoped) |
| PUT/GET | `/v1/sync/blob/:id` | ✅ | Lazy image blob up/download |

Sync endpoints are gated on the `cloudSync` entitlement (Free/Perpetual → 402).

## Why these choices

- **Metered AI behind a proxy** — the vision API key lives only here; Free tier is rejected
  before any model call; every call is rate-limited (Redis-ready) and metered.
- **OAuth vault** — tokens are AES-256-GCM encrypted at rest and never returned to clients;
  `vault.reveal()` is internal-use for future server-side deliveries.
- **Server-authoritative entitlements** — the desktop client mirror is UX only.
- **OAuth login** — authorization-code flow with single-use CSRF state; Google/GitHub
  presets from env. Dev email→token login stays available behind `DEV_LOGIN=true`.
- **Postgres or SQLite** — one async store port, two adapters; set `DATABASE_URL` for Postgres.
- **Modular monolith** — clean module boundaries, no microservice overhead for a small team;
  the AI proxy is the one module clean enough to extract later if volume demands.

## Wiring the desktop app

Set these in the desktop app's environment:

```
SNAPFLOW_AI_PROXY_URL=http://localhost:3001
SNAPFLOW_API_TOKEN=<token from POST /auth/token>
```

With those set, the capture pipeline calls `/v1/ai/tag` for real auto-tagging and falls back
to the offline heuristic if the backend is unreachable.
