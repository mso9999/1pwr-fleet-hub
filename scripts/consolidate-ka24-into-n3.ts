#!/usr/bin/env npx tsx
/**
 * Consolidate duplicate fleet codes: move all KA24 history onto N3, then delete KA24.
 *
 * Usage:
 *   DB_PATH=... npx tsx scripts/consolidate-ka24-into-n3.ts          # dry-run
 *   DB_PATH=... npx tsx scripts/consolidate-ka24-into-n3.ts --apply
 *
 * Also deactivates the KA24 PR Firestore mirror when Firebase Admin is configured.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { syncVehicleToPrFirestore, type FmVehicleRow } from "../src/lib/pr-vehicle-sync";

const APPLY = process.argv.includes("--apply");
const FROM_CODE = "KA24";
const TO_CODE = "N3";

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "..", "data", "fleet-hub.db");

const FALLBACK = path.join(__dirname, "..", "fleet-hub.db");
const dbPath = fs.existsSync(DB_PATH) ? DB_PATH : FALLBACK;

type VehicleRow = FmVehicleRow & {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_plate?: string | null;
  vin?: string | null;
  engine_number?: string | null;
  notes?: string | null;
  status?: string | null;
};

function tableHasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === col);
}

function listTablesWithVehicleId(db: Database.Database): string[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  return tables.map((t) => t.name).filter((name) => tableHasColumn(db, name, "vehicle_id"));
}

async function main(): Promise<void> {
  if (!fs.existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }
  console.log(`DB: ${dbPath} (${APPLY ? "APPLY" : "dry-run"})`);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");

  const from = db
    .prepare("SELECT * FROM vehicles WHERE code = ? COLLATE NOCASE")
    .get(FROM_CODE) as VehicleRow | undefined;
  const to = db
    .prepare("SELECT * FROM vehicles WHERE code = ? COLLATE NOCASE")
    .get(TO_CODE) as VehicleRow | undefined;

  if (!from && !to) {
    console.error(`Neither ${FROM_CODE} nor ${TO_CODE} found.`);
    process.exit(1);
  }

  if (!from && to) {
    console.log(`${FROM_CODE} already gone; survivor ${TO_CODE} id=${to.id}`);
    process.exit(0);
  }

  if (from && !to) {
    console.log(`${TO_CODE} missing — will rename ${FROM_CODE} → ${TO_CODE}`);
    if (APPLY) {
      db.prepare(
        `UPDATE vehicles SET code = ?, notes = trim(COALESCE(notes,'') || ?), updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        TO_CODE,
        `\n[alias] former code ${FROM_CODE} consolidated ${new Date().toISOString().slice(0, 10)}`,
        from.id
      );
      const updated = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(from.id) as VehicleRow;
      const r = await syncVehicleToPrFirestore(updated);
      console.log("PR sync rename:", r);
    }
    console.log(APPLY ? "Renamed." : "Dry-run only.");
    db.close();
    return;
  }

  if (!from || !to) {
    process.exit(1);
  }

  console.log(`FROM ${FROM_CODE} id=${from.id}`);
  console.log(`TO   ${TO_CODE} id=${to.id}`);

  const vehicleTables = listTablesWithVehicleId(db);
  const moves: Array<{ table: string; count: number }> = [];
  for (const table of vehicleTables) {
    const count = (
      db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE vehicle_id = ?`).get(from.id) as {
        c: number;
      }
    ).c;
    if (count > 0) moves.push({ table, count });
  }

  const mediaCount = tableHasColumn(db, "media_attachments", "entity_id")
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM media_attachments
             WHERE entity_type = 'vehicle' AND entity_id = ?`
          )
          .get(from.id) as { c: number }
      ).c
    : 0;

  console.log("Rows to reassign:", moves);
  console.log("Media to reassign:", mediaCount);

  const noteBits: string[] = [];
  if (from.license_plate && from.license_plate !== to.license_plate) {
    noteBits.push(`former plate ${from.license_plate}`);
  }
  if (from.vin && !to.vin) noteBits.push(`VIN from ${FROM_CODE}`);
  if (from.engine_number && !to.engine_number) noteBits.push(`engine from ${FROM_CODE}`);
  noteBits.push(`consolidated from ${FROM_CODE} ${new Date().toISOString().slice(0, 10)}`);

  if (!APPLY) {
    console.log("Would merge identity fields onto N3:", {
      vin: to.vin || from.vin || "",
      engine_number: to.engine_number || from.engine_number || "",
      notesAppend: noteBits.join("; "),
    });
    console.log("Dry-run complete. Re-run with --apply.");
    db.close();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${dbPath}.bak-ka24-n3-${stamp}`;
  fs.copyFileSync(dbPath, backup);
  console.log("Backup:", backup);

  const txn = db.transaction(() => {
    for (const { table } of moves) {
      db.prepare(`UPDATE ${table} SET vehicle_id = ? WHERE vehicle_id = ?`).run(to.id, from.id);
    }
    if (mediaCount > 0) {
      db.prepare(
        `UPDATE media_attachments SET entity_id = ?
         WHERE entity_type = 'vehicle' AND entity_id = ?`
      ).run(to.id, from.id);
    }

    db.prepare(
      `UPDATE vehicles SET
         vin = CASE WHEN COALESCE(vin,'') = '' THEN ? ELSE vin END,
         engine_number = CASE WHEN COALESCE(engine_number,'') = '' THEN ? ELSE engine_number END,
         notes = trim(COALESCE(notes,'') || ?),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      from.vin || "",
      from.engine_number || "",
      `\n[alias] ${noteBits.join("; ")}`,
      to.id
    );

    for (const table of ["missions", "vehicle_requests"]) {
      if (!tableHasColumn(db, table, "assigned_vehicle_id")) continue;
      db.prepare(`UPDATE ${table} SET assigned_vehicle_id = ? WHERE assigned_vehicle_id = ?`).run(
        to.id,
        from.id
      );
    }
    if (tableHasColumn(db, "vehicle_requests", "vehicle_id")) {
      db.prepare(`UPDATE vehicle_requests SET vehicle_id = ? WHERE vehicle_id = ?`).run(to.id, from.id);
    }

    db.prepare("DELETE FROM vehicles WHERE id = ?").run(from.id);
  });

  txn();

  const survivor = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(to.id) as VehicleRow;
  const gone = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(from.id);
  console.log("Survivor N3:", survivor.code, survivor.id, "vin=", survivor.vin);
  console.log("KA24 deleted:", !gone);

  db.close();

  const deactivate = await syncVehicleToPrFirestore(from, { deactivate: true });
  console.log("PR deactivate KA24:", deactivate);
  const syncTo = await syncVehicleToPrFirestore(survivor);
  console.log("PR sync N3:", syncTo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
