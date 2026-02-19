import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : process.cwd();
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "fleet-hub.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
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
      tracker_imei TEXT DEFAULT '',
      tracker_provider TEXT DEFAULT '',
      tracker_sim TEXT DEFAULT '',
      tracker_model TEXT DEFAULT '',
      tracker_install_date TEXT DEFAULT '',
      tracker_status TEXT DEFAULT 'unknown',
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
      status TEXT NOT NULL DEFAULT 'submitted',
      assigned_to TEXT DEFAULT '',
      repair_location TEXT NOT NULL DEFAULT 'hq',
      third_party_shop TEXT DEFAULT '',
      reported_by TEXT DEFAULT '',
      validated_by TEXT DEFAULT '',
      closing_inspection_id TEXT DEFAULT NULL,
      odo_at_report INTEGER,
      total_labour_hours REAL DEFAULT 0,
      parts_cost REAL DEFAULT 0,
      labour_cost REAL DEFAULT 0,
      third_party_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS work_order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by_id TEXT DEFAULT '',
      changed_by_name TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_order_labor (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      worker_id TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'mechanic',
      hours REAL NOT NULL DEFAULT 0,
      rate_per_hour REAL DEFAULT 0,
      description TEXT DEFAULT '',
      work_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_order_po_links (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      pr_number TEXT NOT NULL DEFAULT '',
      po_number TEXT NOT NULL DEFAULT '',
      vendor TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'LSL',
      status TEXT NOT NULL DEFAULT 'pending',
      pr_system_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicle_tracking_reports (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      report_date TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_distance_km REAL DEFAULT 0,
      total_trips INTEGER DEFAULT 0,
      total_driving_hours REAL DEFAULT 0,
      total_idle_hours REAL DEFAULT 0,
      max_speed_kmh REAL DEFAULT 0,
      avg_speed_kmh REAL DEFAULT 0,
      geofence_violations INTEGER DEFAULT 0,
      harsh_braking_events INTEGER DEFAULT 0,
      harsh_acceleration_events INTEGER DEFAULT 0,
      after_hours_usage_minutes INTEGER DEFAULT 0,
      fuel_consumed_liters REAL DEFAULT 0,
      start_location TEXT DEFAULT '',
      end_location TEXT DEFAULT '',
      report_source TEXT NOT NULL DEFAULT 'manual',
      raw_data TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_attachments (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER DEFAULT 0,
      caption TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      uploaded_by_id TEXT DEFAULT '',
      uploaded_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_media_entity ON media_attachments(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS work_order_updates (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      update_type TEXT NOT NULL DEFAULT 'progress',
      note TEXT NOT NULL DEFAULT '',
      posted_by_id TEXT DEFAULT '',
      posted_by_name TEXT DEFAULT '',
      has_photos INTEGER NOT NULL DEFAULT 0,
      photo_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wo_updates ON work_order_updates(work_order_id);

    CREATE TABLE IF NOT EXISTS field_issue_reports (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      reported_by_id TEXT DEFAULT '',
      reported_by_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'medium',
      location TEXT NOT NULL DEFAULT '',
      odometer INTEGER,
      is_driveable INTEGER NOT NULL DEFAULT 1,
      photo_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      work_order_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT DEFAULT NULL
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

  seedDefaultData(db);
}

function seedDefaultData(db: Database.Database): void {
  // Seed organizations
  const orgCount = db.prepare("SELECT COUNT(*) as cnt FROM organizations").get() as { cnt: number };
  if (orgCount.cnt === 0) {
    db.exec(`
      INSERT INTO organizations (id, name, code, country, currency, timezone_offset) VALUES
        ('1pwr_lesotho', '1PWR Lesotho', '1PWR-LS', 'LS', 'LSL', 2),
        ('1pwr_zambia', '1PWR Zambia', '1PWR-ZM', 'ZM', 'ZMW', 2),
        ('1pwr_benin', '1PWR Benin', '1PWR-BN', 'BJ', 'XOF', 1);
    `);
  }

  // Seed reference data (dropdowns) if empty
  const refCount = db.prepare("SELECT COUNT(*) as cnt FROM reference_data").get() as { cnt: number };
  if (refCount.cnt === 0) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO reference_data (id, organization_id, type, code, label, sort_order)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
    `);

    const seedRef = db.transaction((items: Array<{ org: string; type: string; code: string; label: string; sort: number }>) => {
      for (const i of items) {
        insert.run(i.org, i.type, i.code, i.label, i.sort);
      }
    });

    const lsOrg = "1pwr_lesotho";
    const zmOrg = "1pwr_zambia";
    const bnOrg = "1pwr_benin";

    seedRef([
      // Sites / Destinations — Lesotho
      { org: lsOrg, type: "site", code: "HQ", label: "HQ (Maseru)", sort: 1 },
      { org: lsOrg, type: "site", code: "MAK", label: "Makhunoane", sort: 2 },
      { org: lsOrg, type: "site", code: "MAS", label: "Masianokeng", sort: 3 },
      { org: lsOrg, type: "site", code: "SEB", label: "Semonkong/Sebapala", sort: 4 },
      { org: lsOrg, type: "site", code: "MAT", label: "Matsieng", sort: 5 },
      { org: lsOrg, type: "site", code: "LEB", label: "Lebelonyane", sort: 6 },
      { org: lsOrg, type: "site", code: "SEH", label: "Sehlabathebe", sort: 7 },
      { org: lsOrg, type: "site", code: "QN", label: "Qacha's Nek", sort: 8 },
      { org: lsOrg, type: "site", code: "TY", label: "Thaba-Tseka/Teyateyaneng", sort: 9 },
      { org: lsOrg, type: "site", code: "BFN", label: "Bloemfontein", sort: 10 },
      { org: lsOrg, type: "site", code: "JHB", label: "Johannesburg", sort: 11 },
      { org: lsOrg, type: "site", code: "OTHER", label: "Other", sort: 99 },

      // Sites — Zambia
      { org: zmOrg, type: "site", code: "LSK", label: "Lusaka HQ", sort: 1 },
      { org: zmOrg, type: "site", code: "KIT", label: "Kitwe", sort: 2 },
      { org: zmOrg, type: "site", code: "NDL", label: "Ndola", sort: 3 },

      // Sites — Benin
      { org: bnOrg, type: "site", code: "COT", label: "Cotonou HQ", sort: 1 },

      // Mission Types — all orgs
      ...["1pwr_lesotho", "1pwr_zambia", "1pwr_benin"].flatMap((org) => [
        { org, type: "mission_type", code: "fleet-mission", label: "Fleet Mission", sort: 1 },
        { org, type: "mission_type", code: "site-delivery", label: "Site Delivery", sort: 2 },
        { org, type: "mission_type", code: "procurement", label: "Procurement Run", sort: 3 },
        { org, type: "mission_type", code: "registration", label: "Vehicle Registration", sort: 4 },
        { org, type: "mission_type", code: "o&m-mission", label: "O&M Mission", sort: 5 },
        { org, type: "mission_type", code: "ehs-mission", label: "EHS Mission", sort: 6 },
        { org, type: "mission_type", code: "1meter-mission", label: "1Meter Mission", sort: 7 },
        { org, type: "mission_type", code: "other", label: "Other", sort: 99 },
      ]),

      // 3rd party shops — Lesotho
      { org: lsOrg, type: "third_party_shop", code: "BFN_SHOP", label: "BFN (Bloemfontein)", sort: 1 },
      { org: lsOrg, type: "third_party_shop", code: "DELTER", label: "Delter", sort: 2 },
      { org: lsOrg, type: "third_party_shop", code: "ECU_EXPRESS", label: "ECU Express", sort: 3 },
      { org: lsOrg, type: "third_party_shop", code: "JOHN_WILLIAMS", label: "John Williams", sort: 4 },
      { org: lsOrg, type: "third_party_shop", code: "MIDAS", label: "Midas", sort: 5 },
      { org: lsOrg, type: "third_party_shop", code: "AUTO_ELECTRICAL", label: "Auto Electrical", sort: 6 },
      { org: lsOrg, type: "third_party_shop", code: "DRIVELINE", label: "Driveline Shop", sort: 7 },
    ]);
  }
}
