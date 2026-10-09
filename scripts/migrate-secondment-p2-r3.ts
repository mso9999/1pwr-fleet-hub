#!/usr/bin/env npx tsx
/**
 * Convert vehicles that an approved `secondment` request moved by changing organization_id
 * (P2 and R3, now under 1pwr_zambia) into proper secondments: owner back to the request's
 * from_organization_id, seconded_to_org / secondment_start / secondment_expected_return /
 * secondment_request_id from the request. Idempotent; writes record_mutation_log rows.
 *
 * NOT run on app boot. Usage:
 *   DB_PATH=/path/fleet-hub.db npx tsx scripts/migrate-secondment-p2-r3.ts            # dry-run (default)
 *   DB_PATH=/path/fleet-hub.db npx tsx scripts/migrate-secondment-p2-r3.ts --apply
 *   ... --all-approved-secondments   every vehicle with an approved secondment, not just P2/R3
 *   ... --apply --sync-pr            also push the changed vehicles to the PR Firestore mirror
 *                                    (needs Firebase Admin credentials, same as the app)
 */
import Database from "better-sqlite3";
import fs from "fs";
import {
  applySecondmentMigration,
  DEFAULT_SECONDMENT_MIGRATION_CODES,
  DEFAULT_SECONDMENT_MIGRATION_ORG,
  ensureSecondmentColumns,
  hasSecondmentColumns,
  planSecondmentMigration,
  type VehicleSecondmentFields,
} from "../src/lib/secondment-migration";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const ALL = args.has("--all-approved-secondments");
const SYNC_PR = args.has("--sync-pr");

function fmt(f: VehicleSecondmentFields | null): string {
  if (!f) return "—";
  return `org=${f.organization_id} seconded_to=${f.seconded_to_org ?? "∅"} start=${f.secondment_start ?? "∅"} return=${
    f.secondment_expected_return ?? "∅"
  } request=${f.secondment_request_id ?? "∅"}`;
}

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH;
  if (!dbPath) {
    console.error("Set DB_PATH to the fleet-hub SQLite file.");
    process.exit(2);
  }
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    console.error(`DB not found or empty: ${dbPath}`);
    process.exit(2);
  }
  if (SYNC_PR && !APPLY) {
    console.error("--sync-pr only makes sense with --apply.");
    process.exit(2);
  }

  const db = new Database(dbPath);
  const scope = ALL
    ? "all vehicles with an approved secondment request"
    : `codes ${DEFAULT_SECONDMENT_MIGRATION_CODES.join(", ")} in ${DEFAULT_SECONDMENT_MIGRATION_ORG}`;
  console.log(`DB: ${dbPath}\nMode: ${APPLY ? "APPLY" : "dry-run"}\nScope: ${scope}\n`);

  if (!hasSecondmentColumns(db)) {
    if (!APPLY) {
      console.log("vehicles lacks the secondment columns; --apply adds them (same as the app migration).");
      console.log("Nothing else can be planned until they exist.");
      return;
    }
    ensureSecondmentColumns(db);
    console.log("Added secondment columns to vehicles.\n");
  }

  const items = planSecondmentMigration(db, { allApprovedSecondments: ALL });
  if (items.length === 0) console.log("No matching vehicles.");
  for (const it of items) {
    console.log(`${it.code} (${it.vehicleId}) — ${it.action}: ${it.note}`);
    console.log(`  before: ${fmt(it.before)}`);
    if (it.after) console.log(`  after:  ${fmt(it.after)}`);
  }

  const toConvert = items.filter((i) => i.action === "convert");
  if (!APPLY) {
    console.log(`\nDry-run: ${toConvert.length} vehicle(s) would be converted. Re-run with --apply.`);
    return;
  }

  const changed = applySecondmentMigration(db, toConvert);
  console.log(`\nApplied: ${changed} vehicle(s) converted.`);

  // Converted now or by an earlier run: both need the PR mirror to carry the secondment.
  const secondedRows = items
    .filter((i) => i.action === "convert" || i.action === "already_migrated")
    .map((i) => db.prepare("SELECT * FROM vehicles WHERE id = ?").get(i.vehicleId) as Record<string, unknown>)
    .filter((row) => row && row.seconded_to_org);
  for (const row of secondedRows) {
    console.log(`  now: ${row.code} org=${row.organization_id} seconded_to=${row.seconded_to_org}`);
  }
  if (secondedRows.length === 0) return;

  if (SYNC_PR) {
    const { fmVehicleRowFromDb, syncVehicleToPrFirestore } = await import("../src/lib/pr-vehicle-sync");
    for (const row of secondedRows) {
      const r = await syncVehicleToPrFirestore(fmVehicleRowFromDb(row));
      console.log(`  PR mirror ${row.code}: ${r.success ? "synced" : `FAILED (${r.error})`}`);
    }
  } else {
    console.log(
      "\nPR mirror NOT updated. Run this again with --apply --sync-pr (idempotent), or save each vehicle\n" +
        "once in the app (vehicle PATCH re-syncs), or run scripts/sync-vehicles-to-pr-firestore.ts."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
