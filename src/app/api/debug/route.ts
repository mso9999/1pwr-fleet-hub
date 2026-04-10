import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export function GET(): NextResponse {
  const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "fleet-hub.db");
  const results: Record<string, unknown> = { dbPath: DB_PATH };

  try {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    results.tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name);

    const vehicleCols = (db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>).map(r => r.name);
    results.vehicleColumns = vehicleCols;
    results.hasNewVehicleCols = vehicleCols.includes("purchase_price");

    const tripCols = (db.prepare("PRAGMA table_info(trips)").all() as Array<{ name: string }>).map(r => r.name);
    results.tripColumns = tripCols;
    results.hasNewTripCols = tripCols.includes("expected_return_at");

    // Try each migration step
    const steps = [
      ["alter_vehicle_test", () => db.exec("ALTER TABLE vehicles ADD COLUMN _test_col TEXT DEFAULT ''")],
    ];

    // Check SQLite version
    results.sqliteVersion = (db.prepare("SELECT sqlite_version() as v").get() as { v: string }).v;

    // Try the actual migration steps one at a time
    const migrationTests: Array<[string, string]> = [
      ["alter_vehicles_purchase_price", "ALTER TABLE vehicles ADD COLUMN purchase_price REAL DEFAULT 0"],
      ["alter_trips_expected_return", "ALTER TABLE trips ADD COLUMN expected_return_at TEXT DEFAULT NULL"],
      ["create_driver_vehicle_checks", `CREATE TABLE IF NOT EXISTS driver_vehicle_checks (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
        driver_name TEXT NOT NULL DEFAULT '',
        check_date TEXT NOT NULL DEFAULT (date('now')),
        direction TEXT NOT NULL DEFAULT 'departing',
        overall_pass INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`],
      ["create_vehicle_requests", `CREATE TABLE IF NOT EXISTS vehicle_requests (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
        status TEXT NOT NULL DEFAULT 'requested',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`],
    ];

    const migrationResults: Record<string, string> = {};
    for (const [name, sql] of migrationTests) {
      try {
        db.exec(sql);
        migrationResults[name] = "OK";
      } catch (e) {
        migrationResults[name] = String(e);
      }
    }
    results.migrationTests = migrationResults;

    // Now try running the actual getDb() migration
    try {
      const { getDb } = require("@/lib/db");
      getDb();
      results.getDbResult = "OK";
    } catch (e) {
      results.getDbResult = String(e);
    }

    db.close();
  } catch (err) {
    results.error = String(err);
  }

  return NextResponse.json(results);
}
