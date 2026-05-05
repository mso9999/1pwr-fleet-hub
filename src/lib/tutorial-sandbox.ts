import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

/** Stored in `missions.notes`; cleanup matches with `instr(notes, marker)`. */
export const TUTORIAL_SANDBOX_MARKER = "[fleet-hub tutorial sandbox]";

function pickDestinationCode(db: Database.Database, organizationId: string): string {
  const row = db
    .prepare(
      `SELECT code FROM reference_data WHERE organization_id = ? AND type = 'site' AND active = 1 ORDER BY sort_order, label LIMIT 1`
    )
    .get(organizationId) as { code: string } | undefined;
  return row?.code?.trim() || "HQ";
}

/**
 * Ensures one demo vehicle (code TUT-…) exists for the org. Same contract as legacy tutorial seed.
 */
export function ensureTutorialDemoVehicle(
  db: Database.Database,
  organizationId: string
): { id: string; code: string; created: boolean } {
  const existing = db
    .prepare(`SELECT id, code FROM vehicles WHERE organization_id = ? AND code LIKE 'TUT-%' LIMIT 1`)
    .get(organizationId) as { id: string; code: string } | undefined;
  if (existing) {
    return { id: existing.id, code: existing.code, created: false };
  }

  const id = uuidv4();
  const code = `TUT-${id.slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO vehicles (
      id, organization_id, code, make, model, year, license_plate, vin, engine_number,
      asset_class, home_location, current_location, status, photo_url, date_in_service, notes,
      purchase_price, purchase_date, purchase_currency, residual_value, insurance_monthly,
      fuel_type, transmission, drivetrain, engine_capacity_cc, seating_capacity, payload_capacity_kg,
      total_mileage_km, expected_service_life_km, expected_service_life_years,
      service_interval_km, service_interval_months, pool, assigned_team,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    id,
    organizationId,
    code,
    "Ford",
    "Ranger (tutorial demo)",
    2019,
    "",
    "",
    "",
    "4wd",
    "HQ",
    "HQ",
    "operational",
    "",
    "",
    "Tutorial demo — removed when tutorial ends.",
    0,
    "",
    "LSL",
    0,
    0,
    "",
    "",
    "",
    0,
    0,
    0,
    0,
    0,
    0,
    10000,
    6,
    "general",
    "",
    now,
    now
  );

  return { id, code, created: true };
}

export interface SandboxMissionSeedResult {
  missionId: string;
  vehicleId: string;
  reservationId: string;
  vehicleCode: string;
  alreadyExisted: boolean;
}

/**
 * One approved, active mission with a TUT vehicle reservation, eligible for trip checkout (local profile = no DVC gate).
 * Idempotent per organisation.
 */
export function seedTutorialSandboxMission(
  db: Database.Database,
  organizationId: string
): SandboxMissionSeedResult {
  const existingMission = db
    .prepare(`SELECT id FROM missions WHERE organization_id = ? AND instr(notes, ?) > 0 LIMIT 1`)
    .get(organizationId, TUTORIAL_SANDBOX_MARKER) as { id: string } | undefined;

  if (existingMission) {
    const m = db
      .prepare(
        `SELECT assigned_vehicle_id FROM missions WHERE id = ?`
      )
      .get(existingMission.id) as { assigned_vehicle_id: string | null } | undefined;
    const vid = String(m?.assigned_vehicle_id || "").trim();
    const vrow = vid
      ? (db.prepare(`SELECT code FROM vehicles WHERE id = ?`).get(vid) as { code: string } | undefined)
      : undefined;
    const vr = db
      .prepare(`SELECT id FROM vehicle_reservations WHERE mission_id = ? AND status = 'active' LIMIT 1`)
      .get(existingMission.id) as { id: string } | undefined;
    return {
      missionId: existingMission.id,
      vehicleId: vid,
      reservationId: vr?.id ?? "",
      vehicleCode: vrow?.code ?? "",
      alreadyExisted: true,
    };
  }

  const vehicle = ensureTutorialDemoVehicle(db, organizationId);
  const missionId = uuidv4();
  const reservationId = uuidv4();
  const now = new Date().toISOString();

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 3);
  const departureDate = start.toISOString().slice(0, 10);
  const returnDate = end.toISOString().slice(0, 10);
  const destination = pickDestinationCode(db, organizationId);

  const notes = `${TUTORIAL_SANDBOX_MARKER} Demo mission for the interactive tutorial. Removed automatically when you finish or exit the tutorial.`;

  const title = "Tutorial sandbox — practice checkout";

  db.prepare(
    `
    INSERT INTO missions (
      id, organization_id, title, destination, departure_date, return_date,
      mission_type, passengers, loadout_summary, notes, status, trip_id, approval_status,
      approved_by_id, approved_by_name, approved_at, rejection_reason,
      mission_profile, required_vehicle_class, assigned_vehicle_id, rr_status,
      assigned_at, assigned_by_id, assigned_by_name, lifecycle_status,
      created_by_id, created_by_name, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 'planned', NULL, 'approved',
      'tutorial', 'Tutorial sandbox', ?, '',
      'local', '4wd', ?, 'na',
      ?, 'tutorial', 'Tutorial sandbox', 'active',
      'tutorial', 'Tutorial sandbox', ?, ?
    )
  `
  ).run(
    missionId,
    organizationId,
    title,
    destination,
    departureDate,
    returnDate,
    "other",
    "Tutorial",
    "Sandbox loadout — not real cargo.",
    notes,
    now,
    vehicle.id,
    now,
    now,
    now
  );

  db.prepare(
    `
    INSERT INTO vehicle_reservations (
      id, organization_id, vehicle_id, mission_id, start_date, end_date, status,
      override_reason, override_by_id, override_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', '', '', '', ?, ?)
  `
  ).run(reservationId, organizationId, vehicle.id, missionId, departureDate, returnDate, now, now);

  return {
    missionId,
    vehicleId: vehicle.id,
    reservationId,
    vehicleCode: vehicle.code,
    alreadyExisted: false,
  };
}

export interface SandboxCleanupResult {
  deletedMissions: number;
  deletedTrips: number;
  deletedReservations: number;
}

/** Removes sandbox missions, their reservations, and trips linked by mission_id (plus media rows). */
export function deleteTutorialSandboxMissionsAndTrips(
  db: Database.Database,
  organizationId: string
): SandboxCleanupResult {
  const mids = db
    .prepare(`SELECT id FROM missions WHERE organization_id = ? AND instr(notes, ?) > 0`)
    .all(organizationId, TUTORIAL_SANDBOX_MARKER) as Array<{ id: string }>;

  let deletedTrips = 0;
  let deletedReservations = 0;

  const tx = db.transaction(() => {
    for (const { id: mid } of mids) {
      const tripRows = db
        .prepare(`SELECT id FROM trips WHERE mission_id = ?`)
        .all(mid) as Array<{ id: string }>;
      for (const t of tripRows) {
        db.prepare(`DELETE FROM media_attachments WHERE entity_type = 'trip' AND entity_id = ?`).run(t.id);
        db.prepare(`DELETE FROM trip_stops WHERE trip_id = ?`).run(t.id);
        db.prepare(`DELETE FROM trip_odometer_readings WHERE trip_id = ?`).run(t.id);
        db.prepare(`DELETE FROM trips WHERE id = ?`).run(t.id);
        deletedTrips++;
      }

      const resDel = db.prepare(`DELETE FROM vehicle_reservations WHERE mission_id = ?`).run(mid);
      deletedReservations += resDel.changes;

      db.prepare(`UPDATE vehicle_requests SET mission_id = NULL WHERE mission_id = ?`).run(mid);
      db.prepare(`DELETE FROM missions WHERE id = ?`).run(mid);
    }
  });
  tx();

  return { deletedMissions: mids.length, deletedTrips, deletedReservations };
}
