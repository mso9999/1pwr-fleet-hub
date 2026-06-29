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
let schemaReady = false;

/**
 * Lightweight: guarantee vehicle_requests exists even if full Phase-1 DDL never ran.
 */
function ensureVehicleRequestsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      requested_by_id TEXT NOT NULL DEFAULT '',
      requested_by_name TEXT NOT NULL DEFAULT '',
      requested_for TEXT NOT NULL DEFAULT '',
      vehicle_id TEXT DEFAULT NULL,
      assigned_vehicle_id TEXT DEFAULT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      departure_date TEXT NOT NULL DEFAULT '',
      return_date TEXT NOT NULL DEFAULT '',
      passengers TEXT DEFAULT '',
      required_vehicle_class TEXT DEFAULT '',
      loadout_description TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'requested',
      approved_by_id TEXT DEFAULT '',
      approved_by_name TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vr_org ON vehicle_requests(organization_id);
    CREATE INDEX IF NOT EXISTS idx_vr_status ON vehicle_requests(status);
  `);
}

/**
 * Older DBs may have a partial vehicle_requests table; CREATE TABLE IF NOT EXISTS does not add columns.
 * Aligns schema with ensureVehicleRequestsTable so API queries (ORDER BY priority, JOIN assigned_vehicle_id, …) work.
 */
function migrateVehicleRequestsSchema(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vehicle_requests' LIMIT 1")
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(vehicle_requests)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["organization_id", "TEXT NOT NULL DEFAULT '1pwr_lesotho'"],
    ["requested_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["requested_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["requested_for", "TEXT NOT NULL DEFAULT ''"],
    ["vehicle_id", "TEXT DEFAULT NULL"],
    ["assigned_vehicle_id", "TEXT DEFAULT NULL"],
    ["purpose", "TEXT NOT NULL DEFAULT ''"],
    ["destination", "TEXT NOT NULL DEFAULT ''"],
    ["departure_date", "TEXT NOT NULL DEFAULT ''"],
    ["return_date", "TEXT NOT NULL DEFAULT ''"],
    ["passengers", "TEXT DEFAULT ''"],
    ["required_vehicle_class", "TEXT DEFAULT ''"],
    ["loadout_description", "TEXT DEFAULT ''"],
    ["priority", "TEXT NOT NULL DEFAULT 'normal'"],
    ["status", "TEXT NOT NULL DEFAULT 'requested'"],
    ["approved_by_id", "TEXT DEFAULT ''"],
    ["approved_by_name", "TEXT DEFAULT ''"],
    ["rejection_reason", "TEXT DEFAULT ''"],
    ["notes", "TEXT DEFAULT ''"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ["estimated_route_km", "REAL"],
    ["estimated_fuel_liters", "REAL"],
    ["fuel_efficiency_l_per_100km", "REAL"],
    /** Rest & recuperation / travel policy sign-off (aligned with PR travel workflow). */
    ["rr_status", "TEXT NOT NULL DEFAULT 'na'"],
    /** EHS register operator who will drive (canonical row id for this org). */
    ["designated_operator_id", "TEXT DEFAULT NULL"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE vehicle_requests ADD COLUMN ${col} ${def}`);
    }
  }
}

/**
 * Ensures phase-1 vehicle columns and tables exist. Idempotent and safe to run on every getDb().
 * Fixes "no such column: pool" / "no such table: scheduled_maintenance" when an older DB missed migrations.
 */
function ensurePersonalVehicleReimbursementTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_vehicle_reimbursement_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      trip_date TEXT NOT NULL DEFAULT '',
      requested_by_id TEXT NOT NULL DEFAULT '',
      requested_by_name TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      trip_reason TEXT NOT NULL DEFAULT '',
      personal_vehicle_justification TEXT NOT NULL DEFAULT '',
      rate_band TEXT NOT NULL,
      fee_type TEXT NOT NULL,
      total_km REAL,
      reimbursement_lsl REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LSL',
      rate_snapshot_json TEXT NOT NULL DEFAULT '{}',
      pool_operational_count_snapshot INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'submitted',
      approved_by_id TEXT DEFAULT '',
      approved_by_name TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      finance_reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      mission_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pvr_org ON personal_vehicle_reimbursement_requests(organization_id);
    CREATE INDEX IF NOT EXISTS idx_pvr_status ON personal_vehicle_reimbursement_requests(status);
  `);
}

function migratePersonalVehicleReimbursementSchema(db: Database.Database): void {
  const exists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='personal_vehicle_reimbursement_requests' LIMIT 1"
    )
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(personal_vehicle_reimbursement_requests)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["finance_reference", "TEXT DEFAULT ''"],
    ["notes", "TEXT DEFAULT ''"],
    ["approved_at", "TEXT DEFAULT ''"],
    ["mission_id", "TEXT"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE personal_vehicle_reimbursement_requests ADD COLUMN ${col} ${def}`);
    }
  }
}

function ensurePvrRateSettingsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pvr_rate_settings (
      organization_id TEXT PRIMARY KEY,
      full_per_km_lsl REAL NOT NULL,
      half_per_km_lsl REAL NOT NULL,
      hq_basis_km REAL NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_id TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT NOT NULL DEFAULT ''
    );
  `);
}

/**
 * Idempotent: add mission columns expected by list/detail APIs. Legacy DBs (or a partially failed
 * ensurePhase1Schema) can miss columns while `CREATE TABLE IF NOT EXISTS` does nothing — that yields
 * `no such column` on SELECT and a 500 for `/api/missions`.
 */
export function ensureMissionsRowShape(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='missions' LIMIT 1")
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["organization_id", "TEXT NOT NULL DEFAULT '1pwr_lesotho'"],
    ["title", "TEXT NOT NULL DEFAULT ''"],
    ["destination", "TEXT NOT NULL DEFAULT ''"],
    ["departure_date", "TEXT NOT NULL DEFAULT ''"],
    ["return_date", "TEXT NOT NULL DEFAULT ''"],
    ["mission_type", "TEXT NOT NULL DEFAULT 'other'"],
    ["passengers", "TEXT DEFAULT ''"],
    ["loadout_summary", "TEXT DEFAULT ''"],
    ["notes", "TEXT DEFAULT ''"],
    ["status", "TEXT NOT NULL DEFAULT 'planned'"],
    ["trip_id", "TEXT"],
    ["approval_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["approved_by_id", "TEXT DEFAULT ''"],
    ["approved_by_name", "TEXT DEFAULT ''"],
    ["approved_at", "TEXT DEFAULT NULL"],
    ["rejection_reason", "TEXT DEFAULT ''"],
    ["mission_profile", "TEXT NOT NULL DEFAULT 'local'"],
    ["trip_shape", "TEXT NOT NULL DEFAULT 'one_way'"],
    ["required_vehicle_class", "TEXT NOT NULL DEFAULT ''"],
    ["assigned_vehicle_id", "TEXT DEFAULT NULL"],
    ["rr_status", "TEXT NOT NULL DEFAULT 'na'"],
    ["assigned_at", "TEXT DEFAULT NULL"],
    ["assigned_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["assigned_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["lifecycle_status", "TEXT NOT NULL DEFAULT 'active'"],
    ["hr_request_id", "TEXT DEFAULT NULL"],
    ["hr_request_status", "TEXT DEFAULT NULL"],
    ["hr_sync_source", "TEXT DEFAULT NULL"],
    ["hr_source_updated_at", "TEXT DEFAULT NULL"],
    ["approval_source", "TEXT DEFAULT NULL"],
    ["created_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["created_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["created_at", "TEXT NOT NULL DEFAULT (datetime('now'))"],
    ["updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE missions ADD COLUMN ${col} ${def}`);
    }
  }

  const names = new Set(
    (db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (names.has("org_id") && names.has("organization_id")) {
    db.prepare(
      `UPDATE missions SET organization_id = org_id
       WHERE trim(COALESCE(organization_id,'')) = '' AND trim(COALESCE(org_id,'')) != ''`
    ).run();
  }
}

/** Mission list JOINs `vehicles.code`; very old DBs may lack `code`. */
export function ensureVehiclesCodeColumn(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vehicles' LIMIT 1")
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "code")) {
    db.exec(`ALTER TABLE vehicles ADD COLUMN code TEXT NOT NULL DEFAULT ''`);
  }
}

export function ensureMissionsTableAndVehicleRequestMissionId(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      title TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      departure_date TEXT NOT NULL DEFAULT '',
      return_date TEXT NOT NULL DEFAULT '',
      mission_type TEXT NOT NULL DEFAULT 'other',
      passengers TEXT DEFAULT '',
      loadout_summary TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned',
      trip_id TEXT,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      approved_by_id TEXT DEFAULT '',
      approved_by_name TEXT DEFAULT '',
      approved_at TEXT DEFAULT NULL,
      rejection_reason TEXT DEFAULT '',
      mission_profile TEXT NOT NULL DEFAULT 'local',
      trip_shape TEXT NOT NULL DEFAULT 'one_way',
      required_vehicle_class TEXT NOT NULL DEFAULT '',
      assigned_vehicle_id TEXT DEFAULT NULL,
      rr_status TEXT NOT NULL DEFAULT 'na',
      assigned_at TEXT DEFAULT NULL,
      assigned_by_id TEXT NOT NULL DEFAULT '',
      assigned_by_name TEXT NOT NULL DEFAULT '',
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      hr_request_id TEXT DEFAULT NULL,
      hr_request_status TEXT DEFAULT NULL,
      hr_sync_source TEXT DEFAULT NULL,
      hr_source_updated_at TEXT DEFAULT NULL,
      approval_source TEXT DEFAULT NULL,
      created_by_id TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mission_stops (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      stop_order INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      load_out TEXT DEFAULT '',
      load_in TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mission_stops_mission ON mission_stops(mission_id, stop_order);
    CREATE INDEX IF NOT EXISTS idx_missions_org ON missions(organization_id);
    CREATE INDEX IF NOT EXISTS idx_missions_org_status ON missions(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_missions_approval ON missions(organization_id, approval_status);
  `);

  ensureMissionsRowShape(db);

  // Ensure vehicle_requests.mission_id exists BEFORE migrateMissionsApprovalColumns, because its
  // back-fill UPDATE references vr.mission_id. On legacy DBs the old order threw here, the rest
  // of ensurePhase1Schema aborted, and SELECTs against vr.mission_id then 500'd.
  const vrCols = db.prepare("PRAGMA table_info(vehicle_requests)").all() as Array<{ name: string }>;
  const vrHas = (col: string) => vrCols.some((c) => c.name === col);
  if (!vrHas("mission_id")) {
    db.exec(`ALTER TABLE vehicle_requests ADD COLUMN mission_id TEXT REFERENCES missions(id)`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vr_mission ON vehicle_requests(mission_id)`);

  migrateMissionsApprovalColumns(db);
  migrateMissionsCentricAndReservations(db);
}

/** Mission-centric workflow: columns on missions + vehicle_reservations + trips.mission_id; backfill from vehicle_requests. */
function migrateMissionsCentricAndReservations(db: Database.Database): void {
  const mExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='missions' LIMIT 1")
    .get();
  if (!mExists) return;

  const mCols = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  const mHas = (col: string) => mCols.some((c) => c.name === col);

  const missionAdds: Array<[string, string]> = [
    /** Older DBs may have been created before trip_id / mission-centric columns; SELECTs assume these exist. */
    ["trip_id", "TEXT"],
    ["mission_profile", "TEXT NOT NULL DEFAULT 'local'"],
    ["trip_shape", "TEXT NOT NULL DEFAULT 'one_way'"],
    ["required_vehicle_class", "TEXT NOT NULL DEFAULT ''"],
    ["assigned_vehicle_id", "TEXT DEFAULT NULL"],
    ["rr_status", "TEXT NOT NULL DEFAULT 'na'"],
    ["assigned_at", "TEXT DEFAULT NULL"],
    ["assigned_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["assigned_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["lifecycle_status", "TEXT NOT NULL DEFAULT 'active'"],
  ];
  for (const [col, def] of missionAdds) {
    if (!mHas(col)) {
      db.exec(`ALTER TABLE missions ADD COLUMN ${col} ${def}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS mission_stops (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      stop_order INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      load_out TEXT DEFAULT '',
      load_in TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mission_stops_mission ON mission_stops(mission_id, stop_order);

    CREATE TABLE IF NOT EXISTS vehicle_reservations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      override_reason TEXT NOT NULL DEFAULT '',
      override_by_id TEXT NOT NULL DEFAULT '',
      override_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vres_vehicle ON vehicle_reservations(vehicle_id, status);
    CREATE INDEX IF NOT EXISTS idx_vres_mission ON vehicle_reservations(mission_id);
    CREATE INDEX IF NOT EXISTS idx_vres_org_dates ON vehicle_reservations(organization_id, start_date, end_date);
  `);

  migrateTripsMissionId(db);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE missions
       SET trip_shape = 'one_way'
       WHERE trim(COALESCE(trip_shape,'')) = ''
          OR lower(trip_shape) NOT IN ('one_way','round_trip','multi_stop')`
    ).run();

    db.prepare(
      `
      UPDATE missions SET
        required_vehicle_class = COALESCE((
          SELECT vr.required_vehicle_class FROM vehicle_requests vr
          WHERE vr.mission_id = missions.id AND trim(COALESCE(vr.required_vehicle_class,'')) != ''
          ORDER BY vr.updated_at DESC LIMIT 1
        ), required_vehicle_class),
        rr_status = COALESCE((
          SELECT CASE lower(trim(vr.rr_status))
            WHEN 'pending' THEN 'pending' WHEN 'approved' THEN 'approved' ELSE 'na' END
          FROM vehicle_requests vr WHERE vr.mission_id = missions.id
          ORDER BY vr.updated_at DESC LIMIT 1
        ), rr_status)
      WHERE EXISTS (SELECT 1 FROM vehicle_requests vr2 WHERE vr2.mission_id = missions.id)
    `
    ).run();

    db.prepare(
      `
      UPDATE missions SET assigned_vehicle_id = (
        SELECT vr.assigned_vehicle_id FROM vehicle_requests vr
        WHERE vr.mission_id = missions.id
          AND vr.assigned_vehicle_id IS NOT NULL AND trim(vr.assigned_vehicle_id) != ''
        ORDER BY vr.updated_at DESC LIMIT 1
      ),
      assigned_at = COALESCE((
        SELECT vr.updated_at FROM vehicle_requests vr
        WHERE vr.mission_id = missions.id AND vr.status = 'assigned'
        ORDER BY vr.updated_at DESC LIMIT 1
      ), assigned_at),
      assigned_by_id = COALESCE((
        SELECT vr.approved_by_id FROM vehicle_requests vr
        WHERE vr.mission_id = missions.id AND vr.status = 'assigned'
        ORDER BY vr.updated_at DESC LIMIT 1
      ), assigned_by_id),
      assigned_by_name = COALESCE((
        SELECT vr.approved_by_name FROM vehicle_requests vr
        WHERE vr.mission_id = missions.id AND vr.status = 'assigned'
        ORDER BY vr.updated_at DESC LIMIT 1
      ), assigned_by_name)
      WHERE EXISTS (
        SELECT 1 FROM vehicle_requests vr WHERE vr.mission_id = missions.id AND vr.status = 'assigned'
      )
    `
    ).run();

    const rows = db
      .prepare(
        `
      SELECT m.id as mid, m.organization_id as org, m.assigned_vehicle_id as vid,
             m.departure_date as d0, m.return_date as r0
      FROM missions m
      WHERE m.assigned_vehicle_id IS NOT NULL AND trim(m.assigned_vehicle_id) != ''
        AND NOT EXISTS (SELECT 1 FROM vehicle_reservations vr WHERE vr.mission_id = m.id)
    `
      )
      .all() as Array<{ mid: string; org: string; vid: string; d0: string; r0: string }>;

    const ins = db.prepare(`
      INSERT INTO vehicle_reservations (
        id, organization_id, vehicle_id, mission_id, start_date, end_date, status,
        override_reason, override_by_id, override_by_name, created_at, updated_at
      ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'active', '', '', '', datetime('now'), datetime('now'))
    `);

    for (const row of rows) {
      const start = String(row.d0 || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      const ret = String(row.r0 || "").trim();
      const end = (ret ? ret.slice(0, 10) : start) || start;
      ins.run(row.org, row.vid, row.mid, start, end);
    }
  });
  try {
    tx();
  } catch (e) {
    console.warn("[db] migrateMissionsCentricAndReservations backfill (non-fatal):", e);
  }
}

function migrateTripsMissionId(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(trips)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "mission_id")) {
    db.exec(`ALTER TABLE trips ADD COLUMN mission_id TEXT DEFAULT NULL`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trips_mission ON trips(mission_id)`);
}

/** PR mission approval workflow — older DBs created before approval columns. */
function migrateMissionsApprovalColumns(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='missions' LIMIT 1")
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["approval_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["approved_by_id", "TEXT DEFAULT ''"],
    ["approved_by_name", "TEXT DEFAULT ''"],
    ["approved_at", "TEXT DEFAULT NULL"],
    ["rejection_reason", "TEXT DEFAULT ''"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE missions ADD COLUMN ${col} ${def}`);
    }
  }

  db.prepare(
    `UPDATE missions SET approval_status = 'approved'
     WHERE EXISTS (SELECT 1 FROM vehicle_requests vr WHERE vr.mission_id = missions.id)`
  ).run();
}

function ensurePhase1Schema(db: Database.Database): void {
  ensureVehicleRequestsTable(db);
  migrateVehicleRequestsSchema(db);
  ensureMissionsTableAndVehicleRequestMissionId(db);
  ensurePersonalVehicleReimbursementTable(db);
  migratePersonalVehicleReimbursementSchema(db);
  ensurePvrRateSettingsTable(db);
  migrateVehiclesPhase1(db);
  migrateAssetClassCategories(db);
  migrateFieldIssueTicketing(db);
  migrateVehicleGpsSnapshots(db);
  migrateTripsPhase1(db);
  migrateDriverVehicleChecksSchema(db);
  migrateEhsApprovedDrivers(db);
  migrateEhsOperatorRegister(db);
  migrateFleetMechanics(db);
  migrateRecordMutationLog(db);
  migrateOrganizationsRouteOrigin(db);
  migrateVehicleStatusEnforcement(db);

  const hasScheduledMaintenance = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='scheduled_maintenance' LIMIT 1")
    .get();
  const hasVehicleRequests = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vehicle_requests' LIMIT 1")
    .get();
  if (!hasScheduledMaintenance || !hasVehicleRequests) {
    console.warn(
      "[db] Phase 1 tables missing — running createPhase1Tables (scheduled_maintenance, vehicle_requests, …)"
    );
    createPhase1Tables(db);
  }

  migrateWorkOrdersPhase3(db);
  migrateWorkOrderLaborPhase3(db);
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  if (!schemaReady) {
    try {
      initializeSchema(db);
      schemaReady = true;
    } catch (err) {
      console.error("[db] Schema initialization failed:", err);
      try {
        ensurePhase1Schema(db);
        schemaReady = true;
      } catch (repairErr) {
        console.error("[db] Phase 1 repair after init failure:", repairErr);
      }
    }
  }
  try {
    ensurePhase1Schema(db);
  } catch (err) {
    console.error("[db] ensurePhase1Schema:", err);
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
      asset_class TEXT NOT NULL DEFAULT '4wd',
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
      registration_disc_expiry_date TEXT DEFAULT NULL,
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
      trip_shape TEXT NOT NULL DEFAULT 'one_way',
      passengers TEXT DEFAULT '',
      load_out TEXT DEFAULT '',
      load_in TEXT DEFAULT '',
      checkout_at TEXT NOT NULL DEFAULT (datetime('now')),
      checkin_at TEXT,
      issues_observed TEXT DEFAULT '',
      distance INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      planned_departure_date TEXT DEFAULT NULL,
      departed_at TEXT DEFAULT NULL,
      departure_confirmed_by_id TEXT DEFAULT '',
      departure_confirmed_by_name TEXT DEFAULT '',
      departure_discrepancy TEXT DEFAULT NULL
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

    CREATE TABLE IF NOT EXISTS trip_drafts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      created_by_id TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      mission_id TEXT DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trip_drafts_org ON trip_drafts(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_trip_drafts_creator ON trip_drafts(created_by_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trip_drafts_expiry ON trip_drafts(expires_at);

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

  const steps: Array<[string, () => void]> = [
    ["migrateUsersSchema", () => migrateUsersSchema(db)],
    ["migrateInspectionsSchema", () => migrateInspectionsSchema(db)],
    ["migrateVehiclesPhase1", () => migrateVehiclesPhase1(db)],
    ["migrateAssetClassCategories", () => migrateAssetClassCategories(db)],
    ["migrateFieldIssueTicketing", () => migrateFieldIssueTicketing(db)],
    ["migrateVehicleGpsSnapshots", () => migrateVehicleGpsSnapshots(db)],
    ["migrateVehicleCheckOverrideApprovers", () => migrateVehicleCheckOverrideApprovers(db)],
    ["migrateEhsApprovedDrivers", () => migrateEhsApprovedDrivers(db)],
    ["migrateEhsOperatorRegister", () => migrateEhsOperatorRegister(db)],
    ["migrateFleetMechanics", () => migrateFleetMechanics(db)],
    ["migrateRecordMutationLog", () => migrateRecordMutationLog(db)],
    ["migrateVehicleStatusEnforcement", () => migrateVehicleStatusEnforcement(db)],
    ["migrateTripsPhase1", () => migrateTripsPhase1(db)],
    ["migrateTripOdometerReadings", () => migrateTripOdometerReadings(db)],
    ["migrateVehicleCountryChangeWorkflow", () => migrateVehicleCountryChangeWorkflow(db)],
    ["createPhase1Tables", () => createPhase1Tables(db)],
    ["migrateWorkOrdersPhase3", () => migrateWorkOrdersPhase3(db)],
    ["migrateWorkOrderLaborPhase3", () => migrateWorkOrderLaborPhase3(db)],
    ["seedDefaultData", () => seedDefaultData(db)],
  ];

  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (err) {
      console.error(`[db] Migration step "${name}" failed:`, err);
      throw err;
    }
  }
}

function migrateUsersSchema(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE users SET updated_at = created_at WHERE IFNULL(TRIM(updated_at), '') = ''").run();
  }
}

function migrateInspectionsSchema(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(inspections)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "updated_at")) {
    // SQLite requires a constant default on ADD COLUMN; non-constant defaults fail the migration.
    db.exec("ALTER TABLE inspections ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE inspections SET updated_at = created_at WHERE IFNULL(TRIM(updated_at), '') = ''").run();
  }
}

function migrateAssetClassCategories(db: Database.Database): void {
  const renames: Array<[string, string]> = [
    ["light-vehicle", "4wd"],
    ["heavy-vehicle", "cargo-truck"],
    ["equipment", "mobile-equipment"],
  ];
  for (const [from, to] of renames) {
    db.prepare("UPDATE vehicles SET asset_class = ? WHERE asset_class = ?").run(to, from);
  }
}

function migrateFieldIssueTicketing(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_ticket_seq (
      organization_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, year)
    );
  `);

  const cols = db.prepare("PRAGMA table_info(field_issue_reports)").all() as Array<{ name: string }>;
  const has = (n: string) => cols.some((c) => c.name === n);

  const additions: Array<[string, string]> = [
    ["ticket_uid", "TEXT"],
    ["closed_at", "TEXT"],
    ["closed_by_id", "TEXT DEFAULT ''"],
    ["closed_by_name", "TEXT DEFAULT ''"],
    ["attended_by_name", "TEXT DEFAULT ''"],
    ["closeout_outcome", "TEXT DEFAULT ''"],
    ["closeout_notes", "TEXT DEFAULT ''"],
  ];

  for (const [name, def] of additions) {
    if (!has(name)) {
      db.exec(`ALTER TABLE field_issue_reports ADD COLUMN ${name} ${def}`);
    }
  }

  const needsUid = db
    .prepare(`SELECT id FROM field_issue_reports WHERE ticket_uid IS NULL OR TRIM(IFNULL(ticket_uid, '')) = ''`)
    .all() as Array<{ id: string }>;
  for (const r of needsUid) {
    const uid = `IR-MIG-${r.id.replace(/-/g, "").slice(0, 16)}`;
    db.prepare(`UPDATE field_issue_reports SET ticket_uid = ? WHERE id = ?`).run(uid, r.id);
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_field_reports_ticket_uid ON field_issue_reports(ticket_uid)`);
}

function migrateVehicleCheckOverrideApprovers(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_check_override_approvers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      hr_user_id INTEGER,
      hr_employee_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_vc_approvers_org ON vehicle_check_override_approvers(organization_id);
  `);
}

/** EHS-maintained register: employees from HR directory + license evidence + test pass dates. */
function migrateEhsApprovedDrivers(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ehs_approved_drivers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      hr_user_id INTEGER,
      hr_employee_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      license_valid_from TEXT NOT NULL DEFAULT '',
      license_expiry TEXT NOT NULL DEFAULT '',
      written_test_passed_at TEXT NOT NULL DEFAULT '',
      road_test_passed_at TEXT NOT NULL DEFAULT '',
      eye_test_passed_at TEXT NOT NULL DEFAULT '',
      reaction_test_passed_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by_id TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT NOT NULL DEFAULT '',
      UNIQUE (organization_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_ehs_drivers_org ON ehs_approved_drivers(organization_id);
    CREATE INDEX IF NOT EXISTS idx_ehs_drivers_email ON ehs_approved_drivers(organization_id, email);
  `);
}

/**
 * D018 operator register: bring the five Pass / Fail / Pending assessments, the
 * per-record EHS attestation, and a per-category authorizations matrix into Fleet Hub.
 * Runs after migrateEhsApprovedDrivers so the base table exists.
 */
function migrateEhsOperatorRegister(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ehs_approved_drivers' LIMIT 1")
    .get();
  if (!exists) return;

  const cols = db.prepare("PRAGMA table_info(ehs_approved_drivers)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["vision_result", "TEXT NOT NULL DEFAULT 'pending'"],
    ["hearing_result", "TEXT NOT NULL DEFAULT 'pending'"],
    ["reaction_result", "TEXT NOT NULL DEFAULT 'pending'"],
    ["written_offroad_result", "TEXT NOT NULL DEFAULT 'pending'"],
    ["practical_result", "TEXT NOT NULL DEFAULT 'pending'"],
    ["attested_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["attested_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["attested_at", "TEXT DEFAULT NULL"],
  ];
  const needBackfill = additions.some(([c]) => !has(c));
  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE ehs_approved_drivers ADD COLUMN ${col} ${def}`);
    }
  }

  // One-shot back-fill of the new tri-state assessments from the legacy date columns.
  // Reaction remains reaction; hearing stays pending so EHS has to deliberately confirm
  // the new test (which was not in the old schema).
  if (needBackfill) {
    db.exec(`
      UPDATE ehs_approved_drivers
      SET vision_result = CASE WHEN TRIM(COALESCE(eye_test_passed_at, '')) != '' THEN 'pass' ELSE 'pending' END,
          reaction_result = CASE WHEN TRIM(COALESCE(reaction_test_passed_at, '')) != '' THEN 'pass' ELSE 'pending' END,
          written_offroad_result = CASE WHEN TRIM(COALESCE(written_test_passed_at, '')) != '' THEN 'pass' ELSE 'pending' END,
          practical_result = CASE WHEN TRIM(COALESCE(road_test_passed_at, '')) != '' THEN 'pass' ELSE 'pending' END,
          attested_at = NULL
      WHERE vision_result = 'pending'
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ehs_operator_authorizations (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL REFERENCES ehs_approved_drivers(id) ON DELETE CASCADE,
      category_code TEXT NOT NULL,
      grant TEXT NOT NULL DEFAULT 'none',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (operator_id, category_code)
    );
    CREATE INDEX IF NOT EXISTS idx_ehs_ops_auth_op ON ehs_operator_authorizations(operator_id);
    CREATE INDEX IF NOT EXISTS idx_ehs_ops_auth_cat ON ehs_operator_authorizations(category_code);
  `);

  // Back-fill: each legacy driver gets a fleet_vehicle_onroad authorization matching
  // their status so the new register keeps its existing "driver" semantics. We seed
  // once per operator; subsequent runs don't overwrite EHS-edited grants.
  db.exec(`
    INSERT OR IGNORE INTO ehs_operator_authorizations (id, operator_id, category_code, grant, notes, created_at, updated_at)
    SELECT
      lower(hex(randomblob(16))),
      d.id,
      'fleet_vehicle_onroad',
      CASE WHEN d.status = 'active' THEN 'approved' ELSE 'none' END,
      '',
      datetime('now'),
      datetime('now')
    FROM ehs_approved_drivers d
  `);
}

/**
 * Curated roster of fleet mechanics per organisation. Edited by admin / superadmin /
 * manager / fleet_lead or PR department DPO / HR / IT / Fleet; read by everyone.
 * Drives the Work Order Assign-to / Worker pickers (replacing the hardcoded list).
 */
function migrateFleetMechanics(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_mechanics (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      hr_user_id INTEGER,
      hr_employee_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      mechanic_role TEXT NOT NULL DEFAULT 'mechanic',  -- mechanic | trainer | supervisor | apprentice
      specialties TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',            -- active | inactive
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_id TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by_id TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT NOT NULL DEFAULT '',
      UNIQUE (organization_id, display_name)
    );
    CREATE INDEX IF NOT EXISTS idx_fleet_mechanics_org ON fleet_mechanics(organization_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_mechanics_status ON fleet_mechanics(organization_id, status);
  `);

  // Seed the eight historical names once so Work Order Assign-to pickers keep functioning
  // on an existing DB. On a second run the UNIQUE constraint + INSERT OR IGNORE skips them.
  const seedNames = ["Tebesi", "Kola", "Thene", "Molefe", "Khanare", "Seutloali", "Kubutu", "Kelebone"];
  const insertSeed = db.prepare(
    `INSERT OR IGNORE INTO fleet_mechanics (id, organization_id, display_name, status, created_by_name, updated_by_name)
     VALUES (lower(hex(randomblob(16))), '1pwr_lesotho', ?, 'active', 'system-seed', 'system-seed')`
  );
  for (const n of seedNames) insertSeed.run(n);
}

/**
 * Workshop / awaiting-parts / grounded vehicle statuses now require an open work order
 * (submitted through in-progress, needs-parts, pr-submitted, or awaiting-parts); the
 * status_log keeps a `reason` column to capture overrides and write-off sign-offs. The
 * vehicle_status_signoffs table records who approved an exceptional status change (today
 * just `written-off`) so audits can trace management approval.
 */
function migrateVehicleStatusEnforcement(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(status_log)`)
    .all() as Array<{ name: string }>;
  const hasReason = cols.some((c) => c.name === "reason");
  if (!hasReason) {
    db.exec(`ALTER TABLE status_log ADD COLUMN reason TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_status_signoffs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      organization_id TEXT NOT NULL DEFAULT '',
      old_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL,
      approver_id TEXT NOT NULL DEFAULT '',
      approver_name TEXT NOT NULL DEFAULT '',
      approver_role TEXT NOT NULL DEFAULT '',
      approver_department TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      signed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vss_vehicle ON vehicle_status_signoffs(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vss_signed_at ON vehicle_status_signoffs(signed_at DESC);
  `);
}

/**
 * Shared append-only audit log. Any entity_type/entity_id pair can write rows here; we use
 * it today for ehs_approved_drivers and fleet_mechanics. `before_json` / `after_json` are
 * free-form JSON so callers can record whichever columns matter.
 */
function migrateRecordMutationLog(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS record_mutation_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,          -- 'fleet_mechanic' | 'ehs_approved_driver' | ...
      entity_id TEXT NOT NULL,
      organization_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,               -- 'create' | 'update' | 'delete' | 'attest' | ...
      actor_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      actor_department TEXT NOT NULL DEFAULT '',
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_record_mutation_log_entity ON record_mutation_log(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_record_mutation_log_org ON record_mutation_log(organization_id, created_at DESC);
  `);
}

function migrateOrganizationsRouteOrigin(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(organizations)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);
  if (!has("route_origin_lat")) {
    db.exec("ALTER TABLE organizations ADD COLUMN route_origin_lat REAL");
  }
  if (!has("route_origin_lng")) {
    db.exec("ALTER TABLE organizations ADD COLUMN route_origin_lng REAL");
  }
  db.prepare(
    `UPDATE organizations SET route_origin_lat = -29.315, route_origin_lng = 27.487
     WHERE route_origin_lat IS NULL AND id = '1pwr_lesotho'`
  ).run();
}

function migrateVehicleGpsSnapshots(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_gps_snapshots (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      source_ts INTEGER NOT NULL,
      speed INTEGER NOT NULL DEFAULT 0,
      mileage INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (vehicle_id, source_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_gps_org_ts ON vehicle_gps_snapshots(organization_id, source_ts);
    CREATE INDEX IF NOT EXISTS idx_vehicle_gps_vehicle_ts ON vehicle_gps_snapshots(vehicle_id, source_ts);
  `);
}

function migrateVehiclesPhase1(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    // Financial / TCO
    ["purchase_price", "REAL DEFAULT 0"],
    ["purchase_date", "TEXT DEFAULT ''"],
    ["purchase_currency", "TEXT DEFAULT 'LSL'"],
    ["residual_value", "REAL DEFAULT 0"],
    ["insurance_monthly", "REAL DEFAULT 0"],
    // Classification
    ["fuel_type", "TEXT DEFAULT ''"],
    ["transmission", "TEXT DEFAULT ''"],
    ["drivetrain", "TEXT DEFAULT ''"],
    ["engine_capacity_cc", "INTEGER DEFAULT 0"],
    ["seating_capacity", "INTEGER DEFAULT 0"],
    ["payload_capacity_kg", "REAL DEFAULT 0"],
    // Lifecycle
    ["total_mileage_km", "INTEGER DEFAULT 0"],
    ["expected_service_life_km", "INTEGER DEFAULT 0"],
    ["expected_service_life_years", "INTEGER DEFAULT 0"],
    ["eol_score", "REAL DEFAULT 0"],
    ["eol_status", "TEXT DEFAULT 'active'"],
    // Maintenance intervals
    ["service_interval_km", "INTEGER DEFAULT 10000"],
    ["service_interval_months", "INTEGER DEFAULT 6"],
    ["last_service_date", "TEXT DEFAULT ''"],
    ["last_service_km", "INTEGER DEFAULT 0"],
    ["next_service_due_date", "TEXT DEFAULT ''"],
    ["next_service_due_km", "INTEGER DEFAULT 0"],
    // Pool / assignment
    ["pool", "TEXT DEFAULT 'general'"],
    ["assigned_team", "TEXT DEFAULT ''"],
    // Audit (server-filled when Firebase user present)
    ["created_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["created_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["updated_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["updated_by_name", "TEXT NOT NULL DEFAULT ''"],
    ["fuel_consumption_l_per_100km", "REAL"],
    ["fuel_consumption_source", "TEXT NOT NULL DEFAULT ''"],
    /** Road registration disc (window sticker); YYYY-MM-DD or empty = not tracked. */
    ["registration_disc_expiry_date", "TEXT DEFAULT NULL"],
    /** Legacy PR Firestore referenceData_vehicles doc id before FM UUID became canonical. */
    ["pr_firestore_id", "TEXT DEFAULT ''"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE vehicles ADD COLUMN ${col} ${def}`);
    }
  }
}

/**
 * Legacy SQLite DBs may have an older `driver_vehicle_checks` shape (CREATE TABLE IF NOT EXISTS
 * never adds new columns). Align with current API / createPhase1Tables by adding any missing columns.
 */
function migrateDriverVehicleChecksSchema(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='driver_vehicle_checks' LIMIT 1")
    .get();
  if (!exists) return;

  const colNames = new Set(
    (db.prepare("PRAGMA table_info(driver_vehicle_checks)").all() as Array<{ name: string }>).map((c) => c.name)
  );

  const additions: Array<[string, string]> = [
    ["organization_id", "TEXT NOT NULL DEFAULT '1pwr_lesotho'"],
    ["trip_id", "TEXT DEFAULT NULL"],
    ["driver_id", "TEXT NOT NULL DEFAULT ''"],
    ["driver_name", "TEXT NOT NULL DEFAULT ''"],
    ["mileage_km", "INTEGER"],
    ["check_date", "TEXT NOT NULL DEFAULT ''"],
    ["route_from", "TEXT NOT NULL DEFAULT ''"],
    ["route_to", "TEXT NOT NULL DEFAULT ''"],
    ["direction", "TEXT NOT NULL DEFAULT 'departing'"],
    ["electrics_front_lights", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_rear_lights", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_indicators", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_brake_lights", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_horn", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_windows", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_central_locking", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_wipers", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_dashboard_gauges", "TEXT NOT NULL DEFAULT 'pass'"],
    ["electrics_ac_heating", "TEXT NOT NULL DEFAULT 'pass'"],
    ["fluids_engine_oil", "TEXT NOT NULL DEFAULT 'pass'"],
    ["fluids_engine_coolant", "TEXT NOT NULL DEFAULT 'pass'"],
    ["fluids_power_steering", "TEXT NOT NULL DEFAULT 'pass'"],
    ["fluids_transmission", "TEXT NOT NULL DEFAULT 'pass'"],
    ["fluids_fuel", "TEXT NOT NULL DEFAULT 'pass'"],
    ["drive_steering", "TEXT NOT NULL DEFAULT 'pass'"],
    ["drive_brakes", "TEXT NOT NULL DEFAULT 'pass'"],
    ["drive_tire_pressure", "TEXT NOT NULL DEFAULT 'pass'"],
    ["visual_spare_wheel_condition", "TEXT NOT NULL DEFAULT 'pass'"],
    ["visual_doors", "TEXT NOT NULL DEFAULT 'pass'"],
    ["failure_descriptions", "TEXT NOT NULL DEFAULT '{}'"],
    ["remarks", "TEXT NOT NULL DEFAULT ''"],
    ["travel_phone_number", "TEXT NOT NULL DEFAULT ''"],
    ["equip_jack", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_spare_wheel", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_triangle", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_jump_leads", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_fire_extinguisher", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_phone_charger", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_first_aid_kit", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_flashlight", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_wheel_spanners", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_multimeter", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_cable_cutters", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_pliers", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_tow_straps", "INTEGER NOT NULL DEFAULT 1"],
    ["equip_tool_inverter", "INTEGER NOT NULL DEFAULT 1"],
    ["has_exceptions", "INTEGER NOT NULL DEFAULT 0"],
    ["exception_items", "TEXT NOT NULL DEFAULT '[]'"],
    ["exception_approved", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by_id", "TEXT NOT NULL DEFAULT ''"],
    ["approved_by", "TEXT DEFAULT ''"],
    ["approved_at", "TEXT DEFAULT NULL"],
    ["approval_method", "TEXT DEFAULT ''"],
    ["overall_pass", "INTEGER NOT NULL DEFAULT 1"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ["valid_for_departure_on", "TEXT DEFAULT NULL"],
    ["passenger_manifest", "TEXT NOT NULL DEFAULT '[]'"],
  ];

  for (const [col, def] of additions) {
    if (!colNames.has(col)) {
      db.exec(`ALTER TABLE driver_vehicle_checks ADD COLUMN ${col} ${def}`);
      colNames.add(col);
    }
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_dvc_vehicle ON driver_vehicle_checks(vehicle_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_dvc_trip ON driver_vehicle_checks(trip_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_dvc_date ON driver_vehicle_checks(check_date)");
}

function migrateVehicleCountryChangeWorkflow(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_country_change_requests (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      from_organization_id TEXT NOT NULL,
      to_organization_id TEXT NOT NULL,
      change_kind TEXT NOT NULL,
      reason TEXT NOT NULL,
      effective_date TEXT DEFAULT '',
      expected_return_date TEXT DEFAULT '',
      transfer_summary TEXT DEFAULT '',
      mission_trip_id TEXT DEFAULT '',
      mechanical_inspection_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_fleet',
      requested_by_id TEXT NOT NULL DEFAULT '',
      requested_by_name TEXT NOT NULL DEFAULT '',
      reviewed_by_id TEXT DEFAULT '',
      reviewed_by_name TEXT DEFAULT '',
      reviewed_at TEXT DEFAULT '',
      executive_signed_by_id TEXT DEFAULT '',
      executive_signed_by_name TEXT DEFAULT '',
      executive_signed_at TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vccr_vehicle ON vehicle_country_change_requests(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vccr_status ON vehicle_country_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_vccr_from_org ON vehicle_country_change_requests(from_organization_id);
  `);
}

function migrateTripOdometerReadings(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trip_odometer_readings (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      odo_km INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL,
      recorded_by_id TEXT NOT NULL DEFAULT '',
      recorded_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trip_odo_trip ON trip_odometer_readings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_odo_org_recorded ON trip_odometer_readings(organization_id, recorded_at);
  `);
}

function migrateTripsPhase1(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(trips)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["authorized_driver_verified", "INTEGER DEFAULT 0"],
    ["approved_drivers", "TEXT DEFAULT '[]'"],
    ["loadout_manifest", "TEXT DEFAULT '[]'"],
    ["expected_return_at", "TEXT DEFAULT NULL"],
    ["mission_priority", "TEXT DEFAULT 'normal'"],
    ["approval_status", "TEXT DEFAULT 'auto-approved'"],
    ["approved_by", "TEXT DEFAULT ''"],
    ["am_allocation_ids", "TEXT DEFAULT '[]'"],
    ["mission_profile", "TEXT NOT NULL DEFAULT 'local'"],
    ["trip_shape", "TEXT NOT NULL DEFAULT 'one_way'"],
    ["planned_departure_date", "TEXT DEFAULT NULL"],
    ["departed_at", "TEXT DEFAULT NULL"],
    ["departure_confirmed_by_id", "TEXT DEFAULT ''"],
    ["departure_confirmed_by_name", "TEXT DEFAULT ''"],
    ["departure_discrepancy", "TEXT DEFAULT NULL"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE trips ADD COLUMN ${col} ${def}`);
    }
  }
}

function createPhase1Tables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS driver_vehicle_checks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      trip_id TEXT DEFAULT NULL,
      driver_id TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      mileage_km INTEGER,
      check_date TEXT NOT NULL DEFAULT (date('now')),
      route_from TEXT NOT NULL DEFAULT '',
      route_to TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'departing',

      -- Electrics (pass | fail)
      electrics_front_lights TEXT NOT NULL DEFAULT 'pass',
      electrics_rear_lights TEXT NOT NULL DEFAULT 'pass',
      electrics_indicators TEXT NOT NULL DEFAULT 'pass',
      electrics_brake_lights TEXT NOT NULL DEFAULT 'pass',
      electrics_horn TEXT NOT NULL DEFAULT 'pass',
      electrics_windows TEXT NOT NULL DEFAULT 'pass',
      electrics_central_locking TEXT NOT NULL DEFAULT 'pass',
      electrics_wipers TEXT NOT NULL DEFAULT 'pass',
      electrics_dashboard_gauges TEXT NOT NULL DEFAULT 'pass',
      electrics_ac_heating TEXT NOT NULL DEFAULT 'pass',

      -- Fluids
      fluids_engine_oil TEXT NOT NULL DEFAULT 'pass',
      fluids_engine_coolant TEXT NOT NULL DEFAULT 'pass',
      fluids_power_steering TEXT NOT NULL DEFAULT 'pass',
      fluids_transmission TEXT NOT NULL DEFAULT 'pass',
      fluids_fuel TEXT NOT NULL DEFAULT 'pass',

      -- Driveability
      drive_steering TEXT NOT NULL DEFAULT 'pass',
      drive_brakes TEXT NOT NULL DEFAULT 'pass',
      drive_tire_pressure TEXT NOT NULL DEFAULT 'pass',

      -- Visual
      visual_spare_wheel_condition TEXT NOT NULL DEFAULT 'pass',
      visual_doors TEXT NOT NULL DEFAULT 'pass',

      -- Failure descriptions (JSON keyed by field name)
      failure_descriptions TEXT NOT NULL DEFAULT '{}',

      -- Remarks
      remarks TEXT NOT NULL DEFAULT '',

      -- 1PWR handset — number on SIM / contact (paired with equip_phone_charger)
      travel_phone_number TEXT NOT NULL DEFAULT '',

      -- Equipment availability (1 = yes, 0 = no)
      equip_jack INTEGER NOT NULL DEFAULT 1,
      equip_spare_wheel INTEGER NOT NULL DEFAULT 1,
      equip_triangle INTEGER NOT NULL DEFAULT 1,
      equip_jump_leads INTEGER NOT NULL DEFAULT 1,
      equip_fire_extinguisher INTEGER NOT NULL DEFAULT 1,
      equip_phone_charger INTEGER NOT NULL DEFAULT 1,
      equip_first_aid_kit INTEGER NOT NULL DEFAULT 1,
      equip_flashlight INTEGER NOT NULL DEFAULT 1,
      equip_tool_wheel_spanners INTEGER NOT NULL DEFAULT 1,
      equip_tool_multimeter INTEGER NOT NULL DEFAULT 1,
      equip_tool_cable_cutters INTEGER NOT NULL DEFAULT 1,
      equip_tool_pliers INTEGER NOT NULL DEFAULT 1,
      equip_tool_tow_straps INTEGER NOT NULL DEFAULT 1,
      equip_tool_inverter INTEGER NOT NULL DEFAULT 1,

      -- Exception workflow
      has_exceptions INTEGER NOT NULL DEFAULT 0,
      exception_items TEXT NOT NULL DEFAULT '[]',
      exception_approved INTEGER NOT NULL DEFAULT 0,
      approved_by_id TEXT NOT NULL DEFAULT '',
      approved_by TEXT DEFAULT '',
      approved_at TEXT DEFAULT NULL,
      approval_method TEXT DEFAULT '',

      -- Overall
      overall_pass INTEGER NOT NULL DEFAULT 1,

      -- Optional: date this check is intended to cover (e.g. evening check for next-day departure).
      valid_for_departure_on TEXT DEFAULT NULL,

      -- Passenger manifest: JSON array of { employee_id, name, department, country }
      -- referencing HR directory records. Canonical reference is employee_id; the
      -- name snapshot is kept for display/audit history.
      passenger_manifest TEXT NOT NULL DEFAULT '[]',

      -- Timestamps
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_dvc_vehicle ON driver_vehicle_checks(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_dvc_trip ON driver_vehicle_checks(trip_id);
    CREATE INDEX IF NOT EXISTS idx_dvc_date ON driver_vehicle_checks(check_date);
    CREATE INDEX IF NOT EXISTS idx_dvc_valid_for ON driver_vehicle_checks(valid_for_departure_on);

    CREATE TABLE IF NOT EXISTS vehicle_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      requested_by_id TEXT NOT NULL DEFAULT '',
      requested_by_name TEXT NOT NULL DEFAULT '',
      requested_for TEXT NOT NULL DEFAULT '',
      vehicle_id TEXT DEFAULT NULL,
      assigned_vehicle_id TEXT DEFAULT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      departure_date TEXT NOT NULL DEFAULT '',
      return_date TEXT NOT NULL DEFAULT '',
      passengers TEXT DEFAULT '',
      required_vehicle_class TEXT DEFAULT '',
      loadout_description TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'requested',
      approved_by_id TEXT DEFAULT '',
      approved_by_name TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vr_org ON vehicle_requests(organization_id);
    CREATE INDEX IF NOT EXISTS idx_vr_status ON vehicle_requests(status);

    CREATE TABLE IF NOT EXISTS scheduled_maintenance (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      maintenance_type TEXT NOT NULL DEFAULT 'full-service',
      description TEXT DEFAULT '',
      interval_km INTEGER DEFAULT 0,
      interval_months INTEGER DEFAULT 0,
      last_performed_date TEXT DEFAULT '',
      last_performed_km INTEGER DEFAULT 0,
      next_due_date TEXT DEFAULT '',
      next_due_km INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'upcoming',
      work_order_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sm_vehicle ON scheduled_maintenance(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_sm_status ON scheduled_maintenance(status);

    CREATE TABLE IF NOT EXISTS post_deployment_checks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      trip_id TEXT DEFAULT NULL,
      mechanic_id TEXT NOT NULL DEFAULT '',
      mechanic_name TEXT NOT NULL DEFAULT '',
      check_items TEXT NOT NULL DEFAULT '[]',
      findings TEXT NOT NULL DEFAULT '[]',
      work_order_ids TEXT NOT NULL DEFAULT '[]',
      overall_status TEXT NOT NULL DEFAULT 'pass',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pdc_vehicle ON post_deployment_checks(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_pdc_trip ON post_deployment_checks(trip_id);

    CREATE TABLE IF NOT EXISTS pr_cost_cache (
      id TEXT PRIMARY KEY,
      work_order_id TEXT DEFAULT NULL,
      vehicle_code TEXT NOT NULL DEFAULT '',
      pr_number TEXT NOT NULL DEFAULT '',
      pr_status TEXT NOT NULL DEFAULT '',
      approved_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'LSL',
      description TEXT DEFAULT '',
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(pr_number)
    );

    CREATE INDEX IF NOT EXISTS idx_prc_vehicle ON pr_cost_cache(vehicle_code);
    CREATE INDEX IF NOT EXISTS idx_prc_wo ON pr_cost_cache(work_order_id);
  `);
}

function migrateWorkOrdersPhase3(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(work_orders)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["third_party_quote_amount", "REAL DEFAULT 0"],
    ["third_party_invoice_number", "TEXT DEFAULT ''"],
    ["third_party_invoice_amount", "REAL DEFAULT 0"],
    ["third_party_delivery_date", "TEXT DEFAULT ''"],
    ["third_party_quality_notes", "TEXT DEFAULT ''"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE work_orders ADD COLUMN ${col} ${def}`);
    }
  }
}

function migrateWorkOrderLaborPhase3(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(work_order_labor)").all() as Array<{ name: string }>;
  const has = (col: string) => cols.some((c) => c.name === col);

  const additions: Array<[string, string]> = [
    ["started_at", "TEXT DEFAULT NULL"],
    ["completed_at", "TEXT DEFAULT NULL"],
  ];

  for (const [col, def] of additions) {
    if (!has(col)) {
      db.exec(`ALTER TABLE work_order_labor ADD COLUMN ${col} ${def}`);
    }
  }
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
