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

    // Try creating a test table
    try {
      db.exec("CREATE TABLE IF NOT EXISTS _migration_test (id TEXT PRIMARY KEY)");
      db.exec("DROP TABLE IF EXISTS _migration_test");
      results.canCreateTables = true;
    } catch (e) {
      results.canCreateTables = false;
      results.createTableError = String(e);
    }

    // Clean up test col if we added it
    try {
      // SQLite <3.35 can't drop columns, just leave it
    } catch {}

    db.close();
  } catch (err) {
    results.error = String(err);
  }

  return NextResponse.json(results);
}
