# Phase 0 — Data migration runbook

Phase 0 imports historical Excel and chat data into Fleet Hub SQLite. See [specifications.md](../../specifications.md) §11.

## Environment

| Variable | Purpose |
|----------|---------|
| `FLEET_DATA_DIR` | Folder containing the Fleet Maintenance Log `.xlsm`, Cost tracker `.xlsx`, and Grounded vehicles `.xlsx`. Defaults to the parent directory of `fleet-hub` (e.g. `1PWR FLEET`). |
| `FLEET_WHATSAPP_CHAT_PATH` | Optional. Full path to the exported WhatsApp `.txt` for daily updates parsing. Defaults to `../Email Overlord/chat transcripts/...` relative to `FLEET_DATA_DIR`. |
| `DB_PATH` | SQLite file path. Defaults to `fleet-hub/fleet-hub.db`. |

## Expected filenames (adjust dates in `ingest-maintenance-history.ts` if your exports differ)

- `Fleet Maintenance Log book 06022026.xlsm`
- `Cost tracker for vehicles for 06022026.xlsx`
- `GROUNDED VEHICLES,PARTS AND PRICES.xlsx`

## Steps

1. Ensure vehicles exist in the DB (Firestore sync or manual): `npx tsx scripts/sync-vehicles-from-firestore.ts` (requires credentials).
2. Dry run: `npx tsx scripts/ingest-maintenance-history.ts --dry-run`
3. Live ingest: `npx tsx scripts/ingest-maintenance-history.ts`
4. Validate: `npm run validate-migration`

## Validation script

`npm run validate-migration` checks that expected files exist, prints sheet counts where possible, and summarizes row counts in SQLite so you can compare against source workbooks.
