#!/usr/bin/env tsx
/**
 * One-shot repair for the "no vehicles showing" outage (2026-07).
 *
 * The deployed vehicles API (commit 7dbb703) runs:
 *     SELECT * FROM vehicles WHERE organization_id = ? AND COALESCE(is_synthetic, 0) = 0
 * but a DB that never completed the migratePublicTransportSentinelVehicles migration
 * has no `is_synthetic` column, so the query throws "no such column: is_synthetic"
 * and /api/vehicles returns HTTP 500 on every request — the UI renders no vehicles.
 *
 * This script adds the column (if missing) and seeds the per-org PUBLIC-TRANSPORT
 * sentinel vehicles that the migration would have created, so the listing query
 * succeeds and filters them back out again. It speaks to the DB directly via
 * better-sqlite3 (NOT via src/lib/db getDb) precisely so it works on a DB whose
 * own migration runner is the thing that failed.
 *
 * Idempotent: safe to run repeatedly. Default is dry-run; pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/fix-vehicles-is-synthetic.ts                 # dry-run
 *   npx tsx scripts/fix-vehicles-is-synthetic.ts --apply         # write
 *   DB_PATH=/var/lib/fleet-hub/fleet-hub.db npx tsx scripts/fix-vehicles-is-synthetic.ts --apply
 *
 * On the prod EC2 host, run with the same DB_PATH the PM2 app uses (see
 * ecosystem.config.mjs / .env), then `pm2 restart fleet-hub`.
 */

import path from "path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "fleet-hub.db");
const APPLY = process.argv.includes("--apply");

function main(): void {
  console.log(`DB_PATH: ${DB_PATH}`);
  console.log(`Mode:    ${APPLY ? "APPLY (will write)" : "DRY-RUN (no writes — pass --apply to change)"}`);
  console.log("");

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 1. Does the vehicles table exist at all?
  const vehiclesExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vehicles' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!vehiclesExists) {
    console.error("ABORT: no `vehicles` table in this DB. Wrong database? Nothing to repair.");
    process.exit(1);
  }

  // 2. Does is_synthetic already exist?
  const cols = db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>;
  const hasSynthetic = cols.some((c) => c.name === "is_synthetic");
  const hasAssetClass = cols.some((c) => c.name === "asset_class");

  console.log(`vehicles.is_synthetic present: ${hasSynthetic}`);
  console.log(`vehicles.asset_class present:  ${hasAssetClass}`);

  if (!hasSynthetic) {
    console.log("  → will ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasAssetClass) {
    console.log("  → will ADD COLUMN asset_class TEXT NOT NULL DEFAULT '4wd'");
    console.log("    (is_synthetic sentinel insert below needs asset_class; the app's CREATE TABLE");
    console.log("     default is '4wd', and the sentinel itself writes 'synthetic').");
  }

  // 3. Orgs to seed sentinels for. Match the app's migration exactly: one sentinel
  //    per row in `organizations`.
  const orgs = db.prepare("SELECT id, country FROM organizations").all() as Array<{ id: string; country?: string | null }>;
  console.log(`\nOrganizations found: ${orgs.length}`);
  if (orgs.length === 0) {
    console.log("  → no organizations rows; no sentinels to seed. (The app would seed none either.)");
  }

  // Sentinel insert. The app's migration (migratePublicTransportSentinelVehicles)
  // writes registration_disc_expiry_date + asset_class + is_synthetic. The first two
  // are added by earlier migrations (migrateVehiclesPhase1) that usually succeed
  // before the is_synthetic one fails — but don't assume. Build the column list from
  // what currently exists (we omit registration_disc_expiry_date if absent), and
  // force asset_class + is_synthetic in (we ADD them below if missing). The statement
  // is prepared AFTER the ALTERs, inside the apply transaction, so it never references
  // a not-yet-existing column.
  const colNames = new Set(cols.map((c) => c.name));
  const optionalSentinelCols: string[] = [];
  if (colNames.has("registration_disc_expiry_date")) optionalSentinelCols.push("registration_disc_expiry_date");
  optionalSentinelCols.push("asset_class"); // forced: added below if missing
  optionalSentinelCols.push("is_synthetic"); // forced: added below if missing
  const sentinelCols = ["id", "organization_id", "code", "make", "model", "license_plate", "status", ...optionalSentinelCols, "created_at", "updated_at"];
  const sentinelPhValues = sentinelCols
    .map((c) => {
      switch (c) {
        case "id": return "?";
        case "organization_id": return "?";
        case "registration_disc_expiry_date": return "NULL";
        case "asset_class": return "'synthetic'";
        case "is_synthetic": return "1";
        case "created_at":
        case "updated_at": return "datetime('now')";
        default: return { code: "'PUBLIC-TRANSPORT'", make: "'(public transport)'", model: "'(public transport)'", license_plate: "'N/A'", status: "'operational'" }[c];
      }
    })
    .join(", ");
  const sentinelSql = `INSERT OR IGNORE INTO vehicles (${sentinelCols.join(", ")}) VALUES (${sentinelPhValues})`;

  const plannedSentinels: string[] = [];
  const existingSentinels: string[] = [];
  for (const org of orgs) {
    const sentinelId = `public_transport_${org.id}`;
    const existing = db
      .prepare("SELECT 1 FROM vehicles WHERE id = ? OR (organization_id = ? AND code = 'PUBLIC-TRANSPORT') LIMIT 1")
      .get(sentinelId, org.id) as { 1: number } | undefined;
    if (existing) {
      existingSentinels.push(org.id);
    } else {
      plannedSentinels.push(org.id);
    }
  }
  console.log(`\nSentinels already present for orgs: ${existingSentinels.length ? existingSentinels.join(", ") : "(none)"}`);
  console.log(`Sentinels to seed:                ${plannedSentinels.length ? plannedSentinels.join(", ") : "(none)"}`);

  if (!APPLY) {
    console.log("\nDRY-RUN complete. Re-run with --apply to make the changes above.");
    db.close();
    process.exit(0);
  }

  // --- APPLY ---
  console.log("\nApplying changes…");
  const tx = db.transaction(() => {
    if (!hasAssetClass) {
      db.exec(`ALTER TABLE vehicles ADD COLUMN asset_class TEXT NOT NULL DEFAULT '4wd'`);
      console.log("  ✓ added column asset_class");
    }
    if (!hasSynthetic) {
      db.exec(`ALTER TABLE vehicles ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0`);
      console.log("  ✓ added column is_synthetic");
    }
    // Prepare inside the transaction, after the ALTERs, so the column list always resolves.
    const sentinelInsert = db.prepare(sentinelSql);
    for (const orgId of plannedSentinels) {
      sentinelInsert.run(`public_transport_${orgId}`, orgId);
    }
    console.log(`  ✓ seeded ${plannedSentinels.length} sentinel vehicle(s)`);
  });
  tx();

  // Verify the listing query now works.
  const sampleOrg = orgs[0]?.id ?? "1pwr_lesotho";
  const live = db
    .prepare("SELECT COUNT(*) AS n FROM vehicles WHERE organization_id = ? AND COALESCE(is_synthetic, 0) = 0")
    .get(sampleOrg) as { n: number };
  console.log(`\nVerification: listing query for org '${sampleOrg}' returned ${live.n} non-synthetic vehicle(s).`);

  db.close();
  console.log("\nDone. Restart the app (pm2 restart fleet-hub) so it re-runs its own migrations cleanly.");
}

main();
