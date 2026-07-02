# Fleet Hub API Documentation

This directory is the single entry point for **all API surfaces** the Fleet Hub (`fm.1pwrafrica.com`) exposes or consumes — machine-to-machine integrations, internal client API routes, and external consumer contracts. If you're prospecting for API information, start here.

> **Repo root convention:** API docs live in `API/`. Non-API docs (PWA plan, Phase 0 migration, system cards) remain in `docs/`.

---

## Quick map

### Fleet Hub as a provider (things that call Fleet Hub)

| Surface | Auth | Endpoint(s) | Doc |
|---|---|---|---|
| **HR-facing deployments API** (timecard gating + inspection deep links) | `X-API-Key: FLEET_HR_API_KEY` | `GET /api/deployments/current`, `GET /api/deployments`, `GET /api/deployments/inspection/[id]` | [`DEPLOYMENTS_HR_API.md`](./DEPLOYMENTS_HR_API.md) |
| **PR ↔ Work Order integration** (PR system links POs to WOs) | `X-Fleet-Integration-Key: FLEET_INTEGRATION_API_KEY` | `GET /api/integrations/v1/work-orders/[id]`, `POST /api/integrations/v1/work-orders/[id]/pr-links` | [`INTEGRATIONS.md`](./INTEGRATIONS.md) |
| **Vehicles export to PR** (PR mirrors FM vehicle registry) | `X-Fleet-Integration-Key: FLEET_INTEGRATION_API_KEY` | `GET /api/integrations/v1/vehicles` | [`INTEGRATIONS.md`](./INTEGRATIONS.md#vehicles-fm--pr-mirror) |
| **Missions integration (HR per-diem)** | `X-Fleet-Integration-Key` | `GET /api/integrations/v1/missions`, `GET /api/integrations/v1/missions/[id]` | [`INTEGRATIONS.md`](./INTEGRATIONS.md) |
| **PR → FM site ingest** (realtime fanout from PR hub) | `X-API-Key: SITE_SYNC_FANOUT_API_KEY` or Firebase bearer | `POST /api/sync/site-ingest` | [`SITE_SYNC_INGEST.md`](./SITE_SYNC_INGEST.md) |
| **Trip departure** (records canonical field-deployment start) | Firebase bearer (Fleet user) | `POST /api/trips/[id]/depart` | [`TRIP_DEPARTURE.md`](./TRIP_DEPARTURE.md) |
| **Draft cleanup** (scheduled purge of stale mission/trip drafts) | `X-API-Key: DRAFT_CLEANUP_SECRET` or admin/superadmin | `POST /api/sync/cleanup-drafts` | inline in repo [`README.md`](../README.md#missiontrip-drafts) |
| **AM load-out manifest link** (FM writes `trip_id` on AM docs) | Firebase user token (Manager+) or AM server key | AM REST: `POST /api/loadout-manifests/index.php` | [`FM_LOADOUT_MANIFEST_INTEGRATION.md`](./FM_LOADOUT_MANIFEST_INTEGRATION.md) |

### Fleet Hub as a consumer (things Fleet Hub calls)

| Surface | Auth Fleet sends | Endpoint(s) Fleet calls | Doc |
|---|---|---|---|
| **HR employee directory** (passenger manifest picker source) | `X-API-Key: HR_API_KEY` (HR's `HR_API_KEY_FLEET_HUB` slot) | `GET https://hr.1pwrafrica.com/api/employees/directory`, `/meta`, `/lookup/[id]`, `/show/[id]` | [`HR_DIRECTORY_CONSUMER.md`](./HR_DIRECTORY_CONSUMER.md) |
| **UGP site configs** (pull country-aware site codes + GPS) | none today (UGP public) | `GET https://ugp.1pwrafrica.com/api/cc/config/[CC]` | [`UGP_SITE_SYNC.md`](./UGP_SITE_SYNC.md) |
| **PR Firestore** (mirror sites/departments/vehicles; read-only) | Firebase service account | `referenceData_sites`, `referenceData_departments`, `referenceData_vehicles` collections | [`INTEGRATIONS.md`](./INTEGRATIONS.md) |
| **AM Firestore** (load-out manifests; read-only from FM) | Firebase user token | `am_core_loadout_manifests` collection | [`FM_LOADOUT_MANIFEST_INTEGRATION.md`](./FM_LOADOUT_MANIFEST_INTEGRATION.md) |

### Fleet Hub internal client API (browser → Fleet Hub)

All routes under `/api/*` not listed above are internal Fleet Hub client routes authenticated by Firebase bearer token (the signed-in user's ID token). They are not stable public contracts and may change with the UI. Examples: `/api/vehicles`, `/api/trips`, `/api/missions`, `/api/driver-vehicle-checks`, `/api/work-orders`, `/api/inspections`, `/api/ehs-approved-drivers`, `/api/me/whoami`. Source of truth for these is `src/app/api/**/route.ts`.

---

## Auth schemes at a glance

| Scheme | Header / mechanism | Env var | Used by |
|---|---|---|---|
| Fleet HR API key | `X-API-Key: <FLEET_HR_API_KEY>` (+ optional `FLEET_HR_API_ALLOWED_IPS`) | `FLEET_HR_API_KEY` | HR Portal (consuming Fleet Hub deployments) |
| Fleet integration key | `X-Fleet-Integration-Key: <FLEET_INTEGRATION_API_KEY>` | `FLEET_INTEGRATION_API_KEY` | PR system, HR per-diem integration |
| Site sync fanout key | `X-API-Key: <SITE_SYNC_FANOUT_API_KEY>` | `SITE_SYNC_FANOUT_API_KEY` | PR hub fanout → FM/AM |
| Draft cleanup secret | `X-API-Key: <DRAFT_CLEANUP_SECRET>` | `DRAFT_CLEANUP_SECRET` | Scheduled GitHub Actions cron |
| Firebase bearer (Fleet users) | `Authorization: Bearer <Firebase ID token>` | n/a (verified via Google JWKS) | Fleet Hub browser, trip departure, internal routes |
| HR API key (outbound) | `X-API-Key: <HR_API_KEY>` | `HR_API_KEY` | Fleet Hub → HR directory |
| Firebase Admin (outbound) | service account JSON | `FIREBASE_SERVICE_ACCOUNT_PATH` | Fleet Hub → PR/AM Firestore |

Keys are issued per consumer and rotated by updating the GitHub secret + redeploying. See [`HR_API_WIRING.md`](./HR_API_WIRING.md) for the canonical rotation runbook (same pattern applies to other keys).

---

## Env var reference

| Variable | Direction | Purpose |
|---|---|---|
| `FLEET_HR_API_KEY` | inbound (HR → FM) | Auth key HR sends to Fleet Hub's `/api/deployments/*` |
| `FLEET_HR_API_ALLOWED_IPS` | inbound | Optional IP/CIDR allow-list for the HR-facing API |
| `FLEET_PUBLIC_BASE_URL` | outbound (in `inspection_url`) | `https://fm.1pwrafrica.com` — used to build deep links for HR |
| `FLEET_INTEGRATION_API_KEY` | inbound (PR → FM) | Shared secret for PR ↔ WO and vehicles/missions integration |
| `SITE_SYNC_FANOUT_API_KEY` | inbound (PR → FM) | Auth key PR sends to `POST /api/sync/site-ingest` |
| `FIREBASE_ADMIN_BEARER_TOKEN` | inbound | Optional bearer fallback for site-ingest |
| `DRAFT_CLEANUP_SECRET` | inbound (cron → FM) | Auth key for `POST /api/sync/cleanup-drafts` |
| `HR_API_BASE_URL` | outbound (FM → HR) | `https://hr.1pwrafrica.com` |
| `HR_API_KEY` | outbound (FM → HR) | Key Fleet sends to HR (HR's `HR_API_KEY_FLEET_HUB` slot) |
| `UGP_API_BASE_URL` | outbound (FM → UGP) | `https://ugp.1pwrafrica.com/api` |
| `UGP_SITE_COUNTRIES` | outbound | Comma-separated ISO 2-letter codes (default `LS,BN,ZM`) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | outbound (FM → Firestore) | Service account JSON for PR/AM Firestore mirror writes |

All secrets are stored as GitHub Actions secrets and written to `/var/www/fleet-hub/.env` by the deploy workflow (`.github/workflows/deploy.yml`). Never commit secret values to the repo.

---

## Verification

The `HR API smoke test` workflow (`.github/workflows/hr-smoke-test.yml`) exercises both directions of the HR ↔ Fleet Hub contract from the EC2 box. Run it any time:

```bash
gh workflow run "HR API smoke test" --repo mso9999/1pwr-fleet-hub
gh run watch --workflow="HR API smoke test" --repo mso9999/1pwr-fleet-hub
```

For local smoke checks (production-like), see the repo root [`README.md`](../README.md#local-verification-production-like).

---

## File index

| File | What it covers |
|---|---|
| [`DEPLOYMENTS_HR_API.md`](./DEPLOYMENTS_HR_API.md) | HR-facing field-deployments API (the pinned contract HR implements against) |
| [`HR_DIRECTORY_CONSUMER.md`](./HR_DIRECTORY_CONSUMER.md) | Fleet Hub consuming HR's employee directory API |
| [`HR_API_WIRING.md`](./HR_API_WIRING.md) | Operational runbook for setting/rotating `HR_API_BASE_URL` / `HR_API_KEY` |
| [`TRIP_DEPARTURE.md`](./TRIP_DEPARTURE.md) | `POST /api/trips/[id]/depart` — canonical departure event + tracker cross-check |
| [`SITE_SYNC_INGEST.md`](./SITE_SYNC_INGEST.md) | `POST /api/sync/site-ingest` — PR → FM realtime site fanout |
| [`UGP_SITE_SYNC.md`](./UGP_SITE_SYNC.md) | `POST /api/sync/ugp-sites` — FM pulling sites from UGP |
| [`INTEGRATIONS.md`](./INTEGRATIONS.md) | PR ↔ WO integration, vehicles mirror to PR, media/storage, PostgreSQL-vs-SQLite |
| [`FM_LOADOUT_MANIFEST_INTEGRATION.md`](./FM_LOADOUT_MANIFEST_INTEGRATION.md) | AM load-out manifest Firestore + REST contract |

---

## Adding a new API

1. Implement the route under `src/app/api/**/route.ts`.
2. Pick an auth scheme (prefer an existing one — see table above; only introduce a new key if the consumer is genuinely new).
3. Document the contract here: add a row to the appropriate "provider" or "consumer" table, and write a dedicated `API/<NAME>.md` with endpoint paths, JSON field names/types, auth, error codes, and an example response.
4. If the API needs a new secret, wire it into `.github/workflows/deploy.yml` (env + `envs` + sed dedupe + append), and add it to the env var table above.
5. Add a smoke-test step to `.github/workflows/hr-smoke-test.yml` (or a new workflow) so the contract is verifiable end-to-end from the EC2 box.
