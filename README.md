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
- GitHub secrets: `EC2_HOST`, `EC2_SSH_KEY` (SSH user `ec2-user`).
- Server: app lives at `/var/www/fleet-hub`; process managed with `pm2` (`fleet-hub`); default app port **3100**.
- Post-deploy health (from CI): `http://$EC2_HOST:3100/api/dashboard`.

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

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
