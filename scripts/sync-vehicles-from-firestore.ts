#!/usr/bin/env npx tsx
/**
 * Sync vehicle data from PR System Firestore (pr.1pwrafrica.com)
 * into Fleet Hub SQLite database.
 *
 * Reads from Firestore collection: referenceData_vehicles
 * Filtered by organizationId for 1PWR Lesotho (1pwr_lesotho)
 *
 * Usage: npx tsx scripts/sync-vehicles-from-firestore.ts
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const SERVICE_ACCOUNT_PATH = "/Users/mattmso/Dropbox/AI Projects/PR 25 NOV/firebase-service-account.json";
const DB_PATH = path.join(__dirname, "..", "fleet-hub.db");

// Known org IDs for 1PWR Lesotho in the PR system
const ORG_IDS = ["1pwr_lesotho", "1PWR Lesotho", "1pwr lesotho"];

interface FirestoreVehicle {
  id: string;
  name?: string;
  code?: string;
  registrationNumber?: string;
  year?: number;
  make?: string;
  model?: string;
  vinNumber?: string;
  engineNumber?: string;
  active?: boolean;
  organizationId?: string;
  organization?: { id: string; name: string };
}

async function main(): Promise<void> {
  console.log("=== 1PWR Fleet Hub: Firestore Vehicle Sync ===\n");

  // 1. Initialize Firebase Admin
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  const app = initializeApp({
    credential: cert(serviceAccount as ServiceAccount),
  });
  const firestore = getFirestore(app);

  // 2. Fetch all vehicles from referenceData_vehicles
  console.log("Fetching vehicles from Firestore collection: referenceData_vehicles...");
  const snapshot = await firestore.collection("referenceData_vehicles").get();

  console.log(`Total documents in collection: ${snapshot.size}`);

  const allVehicles: FirestoreVehicle[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    allVehicles.push({
      id: doc.id,
      name: data.name || "",
      code: data.code || "",
      registrationNumber: data.registrationNumber || "",
      year: data.year || null,
      make: data.make || "",
      model: data.model || "",
      vinNumber: data.vinNumber || "",
      engineNumber: data.engineNumber || "",
      active: data.active !== false,
      organizationId: data.organizationId || "",
      organization: data.organization || null,
    });
  });

  // Print all org IDs found for debugging
  const orgIds = new Set(allVehicles.map((v) => v.organizationId));
  console.log(`\nOrganization IDs found: ${JSON.stringify([...orgIds])}`);

  // Filter for Lesotho vehicles
  const lsVehicles = allVehicles.filter((v) => {
    const orgId = (v.organizationId || "").toLowerCase().replace(/\s+/g, "_");
    const orgName = (v.organization?.name || "").toLowerCase().replace(/\s+/g, "_");
    return (
      ORG_IDS.some((id) => id.toLowerCase().replace(/\s+/g, "_") === orgId) ||
      ORG_IDS.some((id) => id.toLowerCase().replace(/\s+/g, "_") === orgName)
    );
  });

  console.log(`\n1PWR Lesotho vehicles found: ${lsVehicles.length}`);
  console.log("\nVehicles from Firestore:");
  console.log("─".repeat(100));
  console.log(
    `${"ID".padEnd(25)} ${"Name".padEnd(20)} ${"Code".padEnd(12)} ${"Reg#".padEnd(15)} ${"Make".padEnd(12)} ${"Model".padEnd(15)} ${"Year".padEnd(6)} ${"Active"}`
  );
  console.log("─".repeat(100));
  for (const v of lsVehicles) {
    console.log(
      `${(v.id || "").padEnd(25)} ${(v.name || "").padEnd(20)} ${(v.code || "").padEnd(12)} ${(v.registrationNumber || "").padEnd(15)} ${(v.make || "").padEnd(12)} ${(v.model || "").padEnd(15)} ${String(v.year || "").padEnd(6)} ${v.active}`
    );
  }

  // Also show any non-Lesotho vehicles for awareness
  const otherVehicles = allVehicles.filter((v) => !lsVehicles.includes(v));
  if (otherVehicles.length > 0) {
    console.log(`\nOther org vehicles (not synced): ${otherVehicles.length}`);
    for (const v of otherVehicles) {
      console.log(`  [${v.organizationId}] ${v.name || v.code} (${v.registrationNumber || "no reg"})`);
    }
  }

  // 3. Open SQLite database and ensure schema exists
  console.log(`\nOpening Fleet Hub database: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL DEFAULT 'LS',
      currency TEXT NOT NULL DEFAULT 'LSL',
      timezone_offset INTEGER NOT NULL DEFAULT 2,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firebase_uid TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'driver',
      department TEXT DEFAULT '',
      organization_id TEXT DEFAULT '',
      permission_level INTEGER DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      code TEXT NOT NULL,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      year INTEGER,
      license_plate TEXT DEFAULT '',
      vin TEXT DEFAULT '',
      engine_number TEXT DEFAULT '',
      asset_class TEXT NOT NULL DEFAULT 'light-vehicle',
      home_location TEXT NOT NULL DEFAULT 'HQ',
      current_location TEXT NOT NULL DEFAULT 'HQ',
      status TEXT NOT NULL DEFAULT 'operational',
      photo_url TEXT DEFAULT '',
      date_in_service TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, code)
    );
    CREATE TABLE IF NOT EXISTS reference_data (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      meta TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, type, code)
    );
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      driver_id TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      odo_start INTEGER NOT NULL,
      odo_end INTEGER,
      departure_location TEXT NOT NULL,
      destination TEXT NOT NULL,
      arrival_location TEXT DEFAULT '',
      mission_type TEXT NOT NULL DEFAULT 'other',
      passengers TEXT DEFAULT '',
      load_out TEXT DEFAULT '',
      load_in TEXT DEFAULT '',
      checkout_at TEXT NOT NULL DEFAULT (datetime('now')),
      checkin_at TEXT,
      issues_observed TEXT DEFAULT '',
      distance INTEGER,
      source TEXT NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE IF NOT EXISTS trip_stops (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      stop_number INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      arrived_at TEXT,
      departed_at TEXT,
      odo_reading INTEGER,
      load_out TEXT DEFAULT '',
      load_in TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      inspector_id TEXT NOT NULL DEFAULT '',
      inspector_name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'pre-departure',
      items TEXT NOT NULL DEFAULT '[]',
      overall_pass INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'manual',
      source_image_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'corrective',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'reported',
      assigned_to TEXT DEFAULT '',
      repair_location TEXT NOT NULL DEFAULT 'hq',
      third_party_shop TEXT DEFAULT '',
      reported_by TEXT DEFAULT '',
      validated_by TEXT DEFAULT '',
      odo_at_report INTEGER,
      labour_hours REAL,
      total_cost REAL,
      remarks TEXT DEFAULT '',
      downtime_start TEXT NOT NULL DEFAULT (datetime('now')),
      downtime_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS parts (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL,
      supplier TEXT DEFAULT '',
      pr_status TEXT NOT NULL DEFAULT 'needed',
      delivery_eta TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT DEFAULT '',
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed organizations
  db.exec(`
    INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset) VALUES
      ('1pwr_lesotho', '1PWR Lesotho', '1PWR-LS', 'LS', 'LSL', 2),
      ('1pwr_zambia', '1PWR Zambia', '1PWR-ZM', 'ZM', 'ZMW', 2),
      ('1pwr_benin', '1PWR Benin', '1PWR-BN', 'BJ', 'XOF', 1);
  `);

  // Map Firestore orgId to fleet hub orgId
  function mapOrgId(firestoreOrgId: string): string {
    const normalized = (firestoreOrgId || "").toLowerCase().replace(/\s+/g, "_");
    if (normalized.includes("benin") || normalized === "1pwr_benin") return "1pwr_benin";
    if (normalized.includes("zambia") || normalized === "1pwr_zambia") return "1pwr_zambia";
    return "1pwr_lesotho";
  }

  // 4. Upsert vehicles into SQLite
  const existingVehicles = db.prepare("SELECT id, organization_id, code FROM vehicles").all() as Array<{ id: string; organization_id: string; code: string }>;
  const existingByOrgCode = new Map(existingVehicles.map((v) => [`${v.organization_id}::${v.code.toLowerCase()}`, v]));

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO vehicles (id, organization_id, code, make, model, year, license_plate, vin, engine_number, asset_class, home_location, current_location, status, notes, created_at, updated_at)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HQ', 'HQ', 'operational', ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE vehicles SET make = ?, model = ?, year = ?, license_plate = ?, vin = ?, engine_number = ?, notes = CASE WHEN notes = '' THEN ? ELSE notes END, updated_at = ?
    WHERE organization_id = ? AND code = ? COLLATE NOCASE
  `);

  // Build a mapping from PR system names/codes/IDs to fleet hub codes
  // Firestore docs use both the doc ID (e.g. 'ranger_1') and name field (e.g. 'R1')
  const codeMapping: Record<string, string> = {
    // By Firestore doc ID
    "hardbody_1": "N1",
    "hardbody_2": "V6",
    "hilux": "5L",
    "jeep_1": "J1",
    "jeep_2": "J2",
    "jeep_3": "J3",
    "mazda_1": "M1",
    "pajero": "P1",
    "raider": "Raider",
    "ranger_1": "R1",
    "ranger_2": "R2",
    "ranger_3": "R3",
    "surf_1": "S1",
    "surf_2": "S2",
    "telehandler": "TH",
    "tractors": "Tractors",
    "trailer": "Trailer",
    "xtrail_1": "X1",
    "xtrail_2": "X2",
    "compressor": "Comp",
    "drill_rig": "DRig",
    // By name field (when code matches directly)
    "36": "36",
    "p2": "P2",
    "x0": "X0",
    "x3": "X3",
    "v6": "V6",
    "r1": "R1",
    "r2": "R2",
    "r3": "R3",
    "x1": "X1",
    "x2": "X2",
    "p1": "P1",
    "m1": "M1",
    "t3": "T3",
    "t4": "T4",
    "t6": "T6",
    "t7": "T7",
    "jmc": "JMC",
    "jeep 1": "J1",
    "jeep 2": "J2",
    "jeep 3": "J3",
    "surf 1": "S1",
    "surf 2": "S2",
    "offroad": "Offroad",
    "breakdown": "Breakdown",
    "ty nissan": "KA24",
    "small compressor": "SmComp",
    "big compressor": "BigComp",
    "dolly trailer": "DollyTrailer",
    "other": "Other",
  };

  const upsertAll = db.transaction((vehicles: FirestoreVehicle[]) => {
    for (const v of vehicles) {
      const prName = (v.name || "").toLowerCase().trim();
      const prCode = (v.code || "").toLowerCase().trim();
      const prDocId = (v.id || "").toLowerCase().trim();
      const fleetCode = codeMapping[prName] || codeMapping[prCode] || codeMapping[prDocId] || v.name || v.code || "";
      const orgId = mapOrgId(v.organizationId || "");

      if (!fleetCode) {
        console.log(`  SKIP: No code for vehicle "${v.name}" (id=${v.id})`);
        skipped++;
        continue;
      }

      const existing = existingByOrgCode.get(`${orgId}::${fleetCode.toLowerCase()}`);
      const heavyVehicles = ["36", "TH"];
      const equipmentCodes = ["DRig", "Comp", "SmComp", "BigComp", "Tractors", "Trailer", "DollyTrailer", "ATV", "T3", "T4", "T6", "T7"];
      const assetClass = heavyVehicles.includes(fleetCode)
        ? "heavy-vehicle"
        : equipmentCodes.includes(fleetCode)
          ? "equipment"
          : "light-vehicle";

      const prSyncNote = `PR System ID: ${v.id}`;

      if (existing) {
        updateStmt.run(
          v.make || "",
          v.model || "",
          v.year || null,
          v.registrationNumber || "",
          v.vinNumber || "",
          v.engineNumber || "",
          prSyncNote,
          now,
          orgId,
          fleetCode
        );
        updated++;
        console.log(`  UPDATE: [${orgId}] ${fleetCode} ← ${v.name} (reg: ${v.registrationNumber || "none"})`);
      } else {
        insertStmt.run(
          orgId,
          fleetCode,
          v.make || "",
          v.model || "",
          v.year || null,
          v.registrationNumber || "",
          v.vinNumber || "",
          v.engineNumber || "",
          assetClass,
          prSyncNote,
          now,
          now
        );
        inserted++;
        console.log(`  INSERT: [${orgId}] ${fleetCode} ← ${v.name} (reg: ${v.registrationNumber || "none"})`);
      }
    }
  });

  // Only sync vehicles from known 1PWR orgs (skip neo1, pueco_lesotho, smp which are mirrors)
  const knownOrgIds = new Set(["1pwr_lesotho", "1pwr_benin", "1pwr_zambia"]);
  const vehiclesToSync = allVehicles.filter((v) => {
    const normalized = (v.organizationId || "").toLowerCase().replace(/\s+/g, "_");
    return knownOrgIds.has(normalized);
  });
  console.log(`\nFiltered to ${vehiclesToSync.length} vehicles from known 1PWR orgs`);

  upsertAll(vehiclesToSync);

  console.log(`\n=== Sync Complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total vehicles in Firestore: ${allVehicles.length}`);

  // 5. Print final state
  const finalVehicles = db.prepare("SELECT code, make, model, year, license_plate, status FROM vehicles ORDER BY code").all() as Array<{
    code: string;
    make: string;
    model: string;
    year: number | null;
    license_plate: string;
    status: string;
  }>;

  console.log(`\nFinal Fleet Hub vehicle registry (${finalVehicles.length} total):`);
  console.log("─".repeat(90));
  console.log(`${"Code".padEnd(10)} ${"Make".padEnd(12)} ${"Model".padEnd(20)} ${"Year".padEnd(6)} ${"License".padEnd(15)} ${"Status"}`);
  console.log("─".repeat(90));
  for (const v of finalVehicles) {
    console.log(
      `${v.code.padEnd(10)} ${(v.make || "").padEnd(12)} ${(v.model || "").padEnd(20)} ${String(v.year || "").padEnd(6)} ${(v.license_plate || "").padEnd(15)} ${v.status}`
    );
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
