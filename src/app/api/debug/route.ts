import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export function GET(): NextResponse {
  const DB_PATH = process.env.DB_PATH || require("path").join(process.cwd(), "fleet-hub.db");
  const results: Record<string, unknown> = { dbPath: DB_PATH };

  try {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    results.sqliteVersion = (db.prepare("SELECT sqlite_version() as v").get() as { v: string }).v;
    results.tablesBefore = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name);

    const vehicleCols = (db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>).map(r => r.name);
    results.vehicleColCount = vehicleCols.length;

    const tripCols = (db.prepare("PRAGMA table_info(trips)").all() as Array<{ name: string }>).map(r => r.name);
    results.tripColCount = tripCols.length;

    // Run each Phase 1 vehicle ALTER one at a time
    const vehicleAlters: Array<[string, string]> = [
      ["purchase_price", "REAL DEFAULT 0"],
      ["purchase_date", "TEXT DEFAULT ''"],
      ["purchase_currency", "TEXT DEFAULT 'LSL'"],
      ["residual_value", "REAL DEFAULT 0"],
      ["insurance_monthly", "REAL DEFAULT 0"],
      ["fuel_type", "TEXT DEFAULT ''"],
      ["transmission", "TEXT DEFAULT ''"],
      ["drivetrain", "TEXT DEFAULT ''"],
      ["engine_capacity_cc", "INTEGER DEFAULT 0"],
      ["seating_capacity", "INTEGER DEFAULT 0"],
      ["payload_capacity_kg", "REAL DEFAULT 0"],
      ["total_mileage_km", "INTEGER DEFAULT 0"],
      ["expected_service_life_km", "INTEGER DEFAULT 0"],
      ["expected_service_life_years", "INTEGER DEFAULT 0"],
      ["eol_score", "REAL DEFAULT 0"],
      ["eol_status", "TEXT DEFAULT 'active'"],
      ["service_interval_km", "INTEGER DEFAULT 10000"],
      ["service_interval_months", "INTEGER DEFAULT 6"],
      ["last_service_date", "TEXT DEFAULT ''"],
      ["last_service_km", "INTEGER DEFAULT 0"],
      ["next_service_due_date", "TEXT DEFAULT ''"],
      ["next_service_due_km", "INTEGER DEFAULT 0"],
      ["pool", "TEXT DEFAULT 'general'"],
      ["assigned_team", "TEXT DEFAULT ''"],
    ];

    const vResults: Record<string, string> = {};
    const has = (table: string, col: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(c => c.name === col);

    for (const [col, def] of vehicleAlters) {
      if (has("vehicles", col)) { vResults[col] = "exists"; continue; }
      try {
        db.exec(`ALTER TABLE vehicles ADD COLUMN ${col} ${def}`);
        vResults[col] = "added";
      } catch (e) { vResults[col] = `ERROR: ${String(e)}`; }
    }
    results.vehicleAlters = vResults;

    // Run each Phase 1 trip ALTER
    const tripAlters: Array<[string, string]> = [
      ["authorized_driver_verified", "INTEGER DEFAULT 0"],
      ["approved_drivers", "TEXT DEFAULT '[]'"],
      ["loadout_manifest", "TEXT DEFAULT '[]'"],
      ["expected_return_at", "TEXT DEFAULT NULL"],
      ["mission_priority", "TEXT DEFAULT 'normal'"],
      ["approval_status", "TEXT DEFAULT 'auto-approved'"],
      ["approved_by", "TEXT DEFAULT ''"],
      ["am_allocation_ids", "TEXT DEFAULT '[]'"],
    ];

    const tResults: Record<string, string> = {};
    for (const [col, def] of tripAlters) {
      if (has("trips", col)) { tResults[col] = "exists"; continue; }
      try {
        db.exec(`ALTER TABLE trips ADD COLUMN ${col} ${def}`);
        tResults[col] = "added";
      } catch (e) { tResults[col] = `ERROR: ${String(e)}`; }
    }
    results.tripAlters = tResults;

    // Create Phase 1 tables (simplified — just the critical ones)
    const tableTests: Array<[string, string]> = [
      ["driver_vehicle_checks", "CREATE TABLE IF NOT EXISTS driver_vehicle_checks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho', vehicle_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"],
      ["vehicle_requests", "CREATE TABLE IF NOT EXISTS vehicle_requests (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho', status TEXT NOT NULL DEFAULT 'requested', created_at TEXT NOT NULL DEFAULT (datetime('now')))"],
      ["scheduled_maintenance", "CREATE TABLE IF NOT EXISTS scheduled_maintenance (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho', vehicle_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'upcoming', created_at TEXT NOT NULL DEFAULT (datetime('now')))"],
      ["post_deployment_checks", "CREATE TABLE IF NOT EXISTS post_deployment_checks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho', vehicle_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"],
      ["pr_cost_cache", "CREATE TABLE IF NOT EXISTS pr_cost_cache (id TEXT PRIMARY KEY, pr_number TEXT NOT NULL DEFAULT '', UNIQUE(pr_number))"],
    ];

    const tableResults: Record<string, string> = {};
    for (const [name, sql] of tableTests) {
      if (results.tablesBefore && (results.tablesBefore as string[]).includes(name)) {
        tableResults[name] = "exists";
        continue;
      }
      try {
        db.exec(sql);
        tableResults[name] = "created";
      } catch (e) { tableResults[name] = `ERROR: ${String(e)}`; }
    }
    results.tableCreation = tableResults;

    // Verify final state
    results.tablesAfter = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name);
    results.vehicleColCountAfter = (db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>).length;
    results.tripColCountAfter = (db.prepare("PRAGMA table_info(trips)").all() as Array<{ name: string }>).length;

    db.close();
  } catch (err) {
    results.error = String(err);
  }

  return NextResponse.json(results);
}
