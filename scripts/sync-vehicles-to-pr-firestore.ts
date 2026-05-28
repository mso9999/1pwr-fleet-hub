#!/usr/bin/env npx tsx
/**
 * Bulk push all FM SQLite vehicles into PR Firestore referenceData_vehicles.
 * Run after enabling FM→PR sync or to backfill the mirror.
 *
 * Usage: npx tsx scripts/sync-vehicles-to-pr-firestore.ts
 */

import Database from "better-sqlite3";
import path from "path";
import {
  syncAllVehiclesToPrFirestore,
  type FmVehicleRow,
} from "../src/lib/pr-vehicle-sync";

const DB_PATH = path.join(__dirname, "..", "fleet-hub.db");

async function main(): Promise<void> {
  console.log("=== Fleet Hub → PR Firestore vehicle sync ===\n");
  console.log(`SQLite: ${DB_PATH}`);

  const db = new Database(DB_PATH, { readonly: true });
  const vehicles = db
    .prepare(
      `SELECT id, organization_id, code, make, model, year, license_plate, vin, engine_number, status, pr_firestore_id
       FROM vehicles ORDER BY organization_id, code`
    )
    .all() as FmVehicleRow[];

  db.close();

  console.log(`Found ${vehicles.length} vehicles in FM\n`);

  const result = await syncAllVehiclesToPrFirestore(vehicles);

  console.log(`Synced: ${result.synced}`);
  console.log(`Failed: ${result.failed}`);
  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const e of result.errors) {
      console.log(`  - ${e}`);
    }
  }

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Bulk sync failed:", err);
  process.exit(1);
});
