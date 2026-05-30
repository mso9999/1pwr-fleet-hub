# Fleet Hub Site Sync Ingest

Fleet Hub receives PR site fanout events at `POST /api/sync/site-ingest`.

## Authentication

Either of:

- `X-API-Key: <SITE_SYNC_FANOUT_API_KEY>`
- `Authorization: Bearer <FIREBASE_ADMIN_BEARER_TOKEN>`

## Behavior

- Validates canonical payload (`site.organizationId`, `site.code`, `site.name`, `site.latitude`, `site.longitude`).
- Upserts into local SQLite `reference_data` (`type = site`) by `(organization_id, code)`.
- Merges incoming GPS into `meta` without dropping existing metadata keys.
- Stores idempotency receipts in SQLite `site_sync_events`.

## Related Changes

- `src/lib/firestore-sync.ts`: PR pull-sync now merges site `meta` (including GPS) instead of clobbering it.
- `src/app/api/sync/site-ingest/route.ts`: direct fanout ingest endpoint with idempotency.

## Environment Variables

- `SITE_SYNC_FANOUT_API_KEY`
- `FIREBASE_ADMIN_BEARER_TOKEN` (optional bearer fallback)
