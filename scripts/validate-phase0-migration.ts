/**
 * Validate Phase 0 migration readiness: source files on disk + SQLite counts.
 *
 * Usage:
 *   npx tsx scripts/validate-phase0-migration.ts
 *   FLEET_DATA_DIR=/path/to/data npx tsx scripts/validate-phase0-migration.ts
 */

import fs from "fs";
import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import {
  getFleetDataDir,
  getDbPath,
  PHASE0_SOURCE_FILES,
  getDefaultWhatsAppPath,
} from "./migration-paths";

function main(): void {
  const base = getFleetDataDir();
  const dbPath = getDbPath();

  console.log("=== Phase 0 Migration Validation ===\n");
  console.log(`FLEET_DATA_DIR: ${base}`);
  console.log(`DB_PATH:        ${dbPath}\n`);

  let ok = true;

  console.log("--- Source files (Excel / chat) ---");
  for (const f of PHASE0_SOURCE_FILES) {
    const p = f.resolvePath(base);
    const exists = fs.existsSync(p);
    console.log(`  [${exists ? "OK" : "MISSING"}] ${f.key}: ${p}`);
    if (!exists) ok = false;

    if (exists && f.key === "maintenance_log") {
      try {
        const wb = XLSX.readFile(p);
        const vehicleSheets = wb.SheetNames.filter(
          (n) =>
            !["Status", "Sheet1", "Sheet2", "log template", "Vehicle Schedule"].some((s) =>
              n.toLowerCase().includes(s.toLowerCase())
            )
        );
        console.log(`       → ${wb.SheetNames.length} sheets (${vehicleSheets.length} vehicle-like)`);
      } catch (e) {
        console.log(`       → ERROR reading workbook: ${e}`);
        ok = false;
      }
    }
  }

  const waChat = getDefaultWhatsAppPath();
  const waExists = fs.existsSync(waChat);
  console.log(`  [${waExists ? "OK" : "SKIP"}] whatsapp_chat: ${waChat}`);
  if (!waExists) {
    console.log("       (optional for maintenance ingest — WhatsApp section will be empty)");
  }

  console.log("\n--- SQLite database ---");
  if (!fs.existsSync(dbPath)) {
    console.log(`  MISSING database at ${dbPath}`);
    console.log("  Run ingest after vehicles exist: npx tsx scripts/ingest-maintenance-history.ts --dry-run");
    process.exit(ok ? 1 : 1);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const org = "1pwr_lesotho";
    const vehicles = db.prepare("SELECT COUNT(*) as c FROM vehicles WHERE organization_id = ?").get(org) as { c: number };
    const codes = db
      .prepare("SELECT code FROM vehicles WHERE organization_id = ? ORDER BY code")
      .all(org) as Array<{ code: string }>;

    const wo = db.prepare("SELECT COUNT(*) as c FROM work_orders WHERE organization_id = ?").get(org) as { c: number };
    const woOpen = db
      .prepare(
        "SELECT COUNT(*) as c FROM work_orders WHERE organization_id = ? AND status NOT IN ('completed','validated','closed')"
      )
      .get(org) as { c: number };

    const parts = db.prepare("SELECT COUNT(*) as c FROM parts").get() as { c: number };
    const trips = db.prepare("SELECT COUNT(*) as c FROM trips WHERE organization_id = ?").get(org) as { c: number };
    const inspections = db
      .prepare("SELECT COUNT(*) as c FROM inspections WHERE organization_id = ?")
      .get(org) as { c: number };

    console.log(`  vehicles:       ${vehicles.c}`);
    console.log(`  work_orders:    ${wo.c} (${woOpen.c} open)`);
    console.log(`  parts lines:    ${parts.c}`);
    console.log(`  trips:          ${trips.c}`);
    console.log(`  inspections:    ${inspections.c}`);

    if (codes.length > 0 && codes.length <= 40) {
      console.log(`  vehicle codes:  ${codes.map((c) => c.code).join(", ")}`);
    } else if (codes.length > 40) {
      console.log(`  vehicle codes:  ${codes.length} total (list truncated in output)`);
    }

    const byStatus = db
      .prepare(
        `SELECT status, COUNT(*) as c FROM work_orders WHERE organization_id = ? GROUP BY status ORDER BY c DESC`
      )
      .all(org) as Array<{ status: string; c: number }>;
    console.log("\n  work_orders by status:");
    for (const r of byStatus) {
      console.log(`    ${r.status.padEnd(20)} ${r.c}`);
    }
  } finally {
    db.close();
  }

  console.log("\n=== Result ===");
  if (ok) {
    console.log("All required Excel paths are present. Review counts above against source files.");
    process.exit(0);
  } else {
    console.log("Some required files are missing — set FLEET_DATA_DIR or copy exports into the expected names.");
    process.exit(1);
  }
}

main();
