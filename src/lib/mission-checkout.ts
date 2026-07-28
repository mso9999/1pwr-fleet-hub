import type Database from "better-sqlite3";

/** Mission cannot start a trip until fleet/management clear a non-operational checkout block. */
export const MISSION_LIFECYCLE_CHECKOUT_HOLD = "checkout_hold";
export const UNALLOCATED_VEHICLE_CODE = "UNALLOCATED";

export function unallocatedVehicleId(organizationId: string): string {
  return `unallocated_${organizationId}`;
}

export function isUnallocatedVehicleId(vehicleId: string | null | undefined): boolean {
  return String(vehicleId || "").startsWith("unallocated_");
}

/** Trips are planned before Fleet assigns a physical vehicle. */
export function ensureUnallocatedVehicle(db: Database.Database, organizationId: string): string {
  const id = unallocatedVehicleId(organizationId);
  db.prepare(
    `INSERT OR IGNORE INTO vehicles (
       id, organization_id, code, make, model, license_plate, status,
       registration_disc_expiry_date, asset_class, is_synthetic,
       created_at, updated_at
     ) VALUES (?, ?, ?, '(awaiting fleet allocation)', '(awaiting fleet allocation)', 'N/A',
               'unallocated', NULL, 'synthetic', 1, datetime('now'), datetime('now'))`
  ).run(id, organizationId, UNALLOCATED_VEHICLE_CODE);
  return id;
}

export function syncAllocatedVehicleToPlannedTrip(
  db: Database.Database,
  missionId: string,
  vehicleId: string
): void {
  db.prepare(
    `UPDATE trips SET vehicle_id = ?
     WHERE id = (SELECT trip_id FROM missions WHERE id = ?)
       AND departed_at IS NULL AND checkin_at IS NULL`
  ).run(vehicleId, missionId);
}

export function assertMissionHasPlannedTripForVehicleAllocation(
  db: Database.Database,
  organizationId: string,
  missionId: string
): { ok: true; tripId: string } | { ok: false; error: string; code: string } {
  const mission = db.prepare(
    "SELECT trip_id FROM missions WHERE id = ? AND organization_id = ?"
  ).get(missionId, organizationId) as { trip_id: string | null } | undefined;
  const tripId = String(mission?.trip_id || "").trim();
  if (!tripId) {
    return {
      ok: false,
      error: "Create the trip from this approved mission before Fleet allocates a vehicle.",
      code: "trip_required_before_vehicle_allocation",
    };
  }
  const trip = db.prepare(
    "SELECT departed_at, checkin_at FROM trips WHERE id = ? AND organization_id = ?"
  ).get(tripId, organizationId) as { departed_at: string | null; checkin_at: string | null } | undefined;
  if (!trip) {
    return {
      ok: false,
      error: "The mission's planned trip could not be found. Recreate the trip before Fleet allocation.",
      code: "planned_trip_not_found",
    };
  }
  if (trip.departed_at || trip.checkin_at) {
    return {
      ok: false,
      error: "Fleet allocation can only be changed before the trip departs.",
      code: "trip_already_departed",
    };
  }
  return { ok: true, tripId };
}

export function assertMissionEligibleForTripCreation(
  db: Database.Database,
  organizationId: string,
  missionId: string
): { ok: true } | { ok: false; error: string; code: string } {
  const m = db.prepare(
    `SELECT approval_status, lifecycle_status, trip_id, organization_id
     FROM missions WHERE id = ?`
  ).get(missionId) as {
    approval_status: string;
    lifecycle_status: string;
    trip_id: string | null;
    organization_id: string;
  } | undefined;

  if (!m || m.organization_id !== organizationId) {
    return { ok: false, error: "Mission not found for this organization.", code: "mission_not_found" };
  }
  const life = String(m.lifecycle_status || "active").toLowerCase();
  if (life === MISSION_LIFECYCLE_CHECKOUT_HOLD) {
    return {
      ok: false,
      error: "This mission is on checkout hold. Management must resolve it before a trip can start.",
      code: "checkout_hold",
    };
  }
  if (life !== "active") {
    return { ok: false, error: `Mission is not active (status: ${life}).`, code: "lifecycle_blocked" };
  }
  if (String(m.approval_status || "").toLowerCase() !== "approved") {
    return {
      ok: false,
      error: "Mission is not approved. The PM approver must approve it before trip creation.",
      code: "not_approved",
    };
  }
  if (m.trip_id) {
    const t = db.prepare("SELECT checkin_at FROM trips WHERE id = ?").get(m.trip_id) as
      | { checkin_at: string | null }
      | undefined;
    if (t && !t.checkin_at) {
      return {
        ok: false,
        error: "This mission already has an active trip. Complete check-in first.",
        code: "active_trip_exists",
      };
    }
  }
  return { ok: true };
}

/** Backward-compatible export for existing callers. */
export const assertMissionEligibleForTripCheckout = assertMissionEligibleForTripCreation;
