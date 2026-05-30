# Fleet Hub

Next.js fleet operations app (vehicles, trips, work orders, map, etc.).

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The fleet map is at `/map`.

## Local verification (production-like)

```bash
npm run build
npm run start -- -p 3100
```

Smoke checks:

```bash
curl -sf http://127.0.0.1:3100/api/dashboard
curl -sf "http://127.0.0.1:3100/api/vehicles/locations?rewindHours=0"
curl -sf "http://127.0.0.1:3100/api/vehicles/locations?rewindHours=24"
```

Expect JSON with `vehicles`, `sites`, and per-vehicle `refTimeUnix`, `historyTrail`, `rewindHours`.

## Deployment (EC2)

- Workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — runs on push to `main` and manual dispatch.
- GitHub secrets: `EC2_HOST`, `EC2_SSH_KEY` (SSH user `ec2-user`). Optional: `HR_API_BASE_URL`, `HR_API_KEY`, **`FLEET_INTEGRATION_API_KEY`** (written into `/var/www/fleet-hub/.env` on each deploy for [PR ↔ WO integration](docs/INTEGRATIONS.md)).
- Server: app lives at `/var/www/fleet-hub`; process managed with `pm2` (`fleet-hub`). Node typically listens on **3100**; **Apache on port 80** often reverse-proxies to it (public checks use **80**, not 3100, when the security group blocks 3100).
- Post-deploy health (from CI): tries `http://$EC2_HOST/api/health` first, then `:3100/api/health`.

### Confirm CI from the CLI

```bash
gh run list --workflow=deploy.yml --limit 5
```

Successful runs imply the workflow could authenticate and the health check step reached the server (secrets and host must be valid for that run).

## PR reference lists (sites & departments)

Fleet Hub mirrors shared PR Firestore collections into SQLite `reference_data` (read-only from Firestore):

- `referenceData_sites` → `type = site`
- `referenceData_departments` → `type = department`

Trigger a sync: **Admin** page → **Sync sites & departments from PR**, or `POST /api/sync/pr-reference?org=1pwr_lesotho` (requires `FIREBASE_SERVICE_ACCOUNT_PATH`). `POST /api/sync/sites` still syncs sites only.

## Realtime Site Ingest (PR -> FM)

Fleet Hub now accepts direct PR fanout for sites:

- Endpoint: `POST /api/sync/site-ingest`
- Auth: `X-API-Key: SITE_SYNC_FANOUT_API_KEY` (or admin bearer fallback)
- Upsert target: SQLite `reference_data` (`type=site`) with GPS-preserving `meta` merge

Details and env vars: [`docs/SITE_SYNC_INGEST.md`](docs/SITE_SYNC_INGEST.md).

## Mission/Trip Drafts

- Trip checkout now shows **Create mission now** when no eligible missions are available.
- Missions can be saved as draft, edited later, then submitted for approval.
- Trip checkout supports private draft saves before Start Trip.
- Draft visibility policy: creator + admin + IT (fleet lead/manager do not get access by role alone).
- Stale draft cleanup endpoint: `POST /api/sync/cleanup-drafts` (admin/superadmin or `DRAFT_CLEANUP_SECRET`).
- Local smoke-check: `npm run test:mission-trip-drafts`.
- Automated cleanup workflow: `.github/workflows/draft-cleanup.yml` (daily cron).

### Draft Cleanup Setup

Add GitHub secret:

- `DRAFT_CLEANUP_SECRET` — shared with server `.env` for `POST /api/sync/cleanup-drafts`.

Deploy workflow writes this secret into `/var/www/fleet-hub/.env`, and scheduled workflow `Draft Cleanup` runs daily to purge mission/trip drafts older than 30 days.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
