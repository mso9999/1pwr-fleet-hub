import type Database from "better-sqlite3";

/** Mission cannot start a trip until fleet/management clear a non-operational checkout block. */
export const MISSION_LIFECYCLE_CHECKOUT_HOLD = "checkout_hold";

export function assertMissionEligibleForTripCheckout(
  db: Database.Database,
  organizationId: string,
  missionId: string
): { ok: true } | { ok: false; error: string; code: string } {
  const m = db
    .prepare(
      `SELECT id, approval_status, assigned_vehicle_id, lifecycle_status, trip_id, organization_id, transport_mode
       FROM missions WHERE id = ?`
    )
    .get(missionId) as
    | {
        id: string;
        approval_status: string;
        assigned_vehicle_id: string | null;
        lifecycle_status: string;
        trip_id: string | null;
        organization_id: string;
        transport_mode?: string | null;
      }
    | undefined;

  if (!m || m.organization_id !== organizationId) {
    return { ok: false, error: "Mission not found for this organization.", code: "mission_not_found" };
  }

  const life = String(m.lifecycle_status || "active").toLowerCase();
  if (life === MISSION_LIFECYCLE_CHECKOUT_HOLD) {
    return {
      ok: false,
      error:
        "This mission is on checkout hold (e.g. reserved vehicle not operational). Management must resolve or fleet must reassign before a trip can start.",
      code: "checkout_hold",
    };
  }
  if (life !== "active") {
    return {
      ok: false,
      error: `Mission is not active (status: ${life}).`,
      code: "lifecycle_blocked",
    };
  }

  if (String(m.approval_status || "").toLowerCase() !== "approved") {
    return {
      ok: false,
      error: "Mission is not approved. Management must approve before checkout.",
      code: "not_approved",
    };
  }

  // Non-company-vehicle missions (public transport, third-party, personal
  // vehicle) do NOT require a reserved vehicle — the trip is lodged against
  // a sentinel/personal vehicle record. Only company_vehicle missions need
  // an assigned_vehicle_id.
  const transportMode = String(m.transport_mode || "company_vehicle").toLowerCase();
  const needsReservedVehicle =
    transportMode === "company_vehicle" || transportMode === "";

  if (needsReservedVehicle && !String(m.assigned_vehicle_id || "").trim()) {
    return {
      ok: false,
      error: "Mission has no reserved vehicle. Fleet must reserve a vehicle first.",
      code: "no_reserved_vehicle",
    };
  }

  if (m.trip_id) {
    const t = db
      .prepare("SELECT checkin_at FROM trips WHERE id = ?")
      .get(m.trip_id) as { checkin_at: string | null } | undefined;
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
