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

## Related scripts

- Phase 0 Excel paths: **`FLEET_DATA_DIR`** — see [PHASE0-MIGRATION.md](./PHASE0-MIGRATION.md).
- Firestore sync scripts (users/vehicles) use local service account JSON paths — keep secrets out of git.
