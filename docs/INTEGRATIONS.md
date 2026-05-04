# Integrations — storage and database

## Media / files (Dropbox vs local)

| Approach | Status | Notes |
|----------|--------|--------|
| **Local uploads** | **In use** | `POST /api/media` stores files under `public/uploads` (see deployment notes). Suitable for EC2 disk + Nginx `alias`. |
| **Dropbox API** | **Not implemented in app** | Spec §10.2 referenced Python `dropbox_client.py` patterns elsewhere. Use when you need centralized backup, sharing with finance, or sync from Dropbox-native workflows. |

**Decision:** Keep **local media** for the current EC2 deployment. Add Dropbox (or S3) when you require off-server durability, multi-tenant access, or automated folder sync to the `1PWR FLEET` Dropbox tree.

Environment variables for a future Dropbox integration would typically include `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, and a base path — not wired in code today.

## PostgreSQL vs SQLite

| Engine | Status | Notes |
|--------|--------|--------|
| **SQLite** (`better-sqlite3`) | **Production today** | Single file (`DB_PATH`), WAL mode, simple backups (`cp` + optional `sqlite3 .backup`). Fits current fleet scale and single-node EC2. |
| **PostgreSQL** | **Optional migration** | Consider when you need concurrent writes at high volume, replication, row-level security, or managed hosting (RDS, etc.). Would replace `getDb()` with a pooled client and migrate schema 1:1. |

**Decision:** Stay on **SQLite** until you hit backup/HA requirements or measurable lock contention. Migrating is a **deployment + schema port** task, not a product feature request.

## Asset Management — load-out manifests (trips)

Trips in FM can be associated with **packing lists / load-out manifests** maintained in **am.1pwrafrica.com** (same Firebase project). Specification, Firestore fields, REST API, and UI suggestions:

- **[FM_LOADOUT_MANIFEST_INTEGRATION.md](./FM_LOADOUT_MANIFEST_INTEGRATION.md)**

## Purchase requests (PR) ↔ Work orders (WO)

Fleet Hub stores PR/PO links on work orders (`work_order_po_links`) and can read PR status from the shared Firestore `purchaseRequests` collection into local `pr_cost_cache` (read-only from Firestore — see `src/lib/firestore-sync.ts`).

### Environment

| Variable | Purpose |
|----------|---------|
| `FLEET_INTEGRATION_API_KEY` | Shared secret (≥12 characters). PR backend or scripts send it as header **`X-Fleet-Integration-Key`**. If unset, integration endpoints return 401. **Production:** add the same value as GitHub Actions secret `FLEET_INTEGRATION_API_KEY` so [deploy.yml](../.github/workflows/deploy.yml) can append it to `/var/www/fleet-hub/.env` on each deploy (optional secret — omit until the PR service is ready). |

### Endpoints (machine-to-machine)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations/v1/work-orders/{id}` | Validate that a WO exists; returns `organizationId`, `vehicleId`, `vehicleCode`, `title`, `status`, dates. |
| `POST` | `/api/integrations/v1/work-orders/{id}/pr-links` | Register a PR against the WO (same JSON body as fleet `po-links`: `prNumber`, `poNumber`, `vendor`, `description`, `amount`, `currency`, `status`, `prSystemUrl`). If the WO is in **`needs-parts`**, it is advanced to **`pr-submitted`** and a row is written to `work_order_status_history`. Then PR status is refreshed into `pr_cost_cache` when Firestore admin is configured. |

Fleet users with a Fleet-team department (or superadmin) can also call **`POST /api/work-orders/{id}/po-links`** with a normal session cookie / bearer token — same behaviour, including optional auto-advance from `needs-parts` → `pr-submitted`.

### WO procurement statuses

| Status | Meaning |
|--------|---------|
| `needs-parts` | Parts identified; PR not yet submitted in the PR system. |
| `pr-submitted` | PR linked / submitted; waiting on approval, PO, or delivery. |
| `awaiting-parts` | Legacy / generic “waiting on parts” (still valid); may be used alongside the above depending on process. |

### PR product contract (summary)

1. Before creating a vehicle- or fleet-related PR line item, call **`GET /api/integrations/v1/work-orders/{woId}`** and confirm the WO belongs to the expected org and vehicle.
2. After the PR is created, call **`POST .../pr-links`** with at least `prNumber` (and optional financial fields). Fleet Hub never writes to Firestore purchase requests from these routes.

## Related scripts

- Phase 0 Excel paths: **`FLEET_DATA_DIR`** — see [PHASE0-MIGRATION.md](./PHASE0-MIGRATION.md).
- Firestore sync scripts (users/vehicles) use local service account JSON paths — keep secrets out of git.
