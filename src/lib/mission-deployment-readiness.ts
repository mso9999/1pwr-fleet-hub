import type Database from "better-sqlite3";
import { evaluateTripReadiness, MISSION_PROFILE, type ReadinessGate } from "@/lib/trip-readiness";
import { missionWindowEndDate } from "@/lib/registration-disc";

export interface MissionTripReadinessResult {
  ok: boolean;
  gates: ReadinessGate[];
  missionProfile: string;
  missionBlockedReason?: string;
}

/**
 * Readiness when starting a trip linked to an approved mission with an assigned vehicle.
 */
export function evaluateReadinessForMissionLinkedTrip(
  db: Database.Database,
  input: {
    organizationId: string;
    missionId: string;
    vehicleId: string;
    referenceNow?: Date;
    checkDate?: string;
  }
): MissionTripReadinessResult {
  const m = db
    .prepare(
      `SELECT id, approval_status, assigned_vehicle_id, mission_profile, lifecycle_status,
              departure_date, return_date
       FROM missions WHERE id = ? AND organization_id = ?`
    )
    .get(input.missionId, input.organizationId) as
    | {
        id: string;
        approval_status: string;
        assigned_vehicle_id: string | null;
        mission_profile: string;
        lifecycle_status: string;
        departure_date: string;
        return_date: string;
      }
    | undefined;

  const gates: ReadinessGate[] = [];
  if (!m) {
    gates.push({
      id: "mission",
      label: "Mission",
      status: "blocked",
      detail: "Mission not found for this organization.",
    });
    return { ok: false, gates, missionProfile: MISSION_PROFILE.LOCAL, missionBlockedReason: "not_found" };
  }

  const life = String(m.lifecycle_status || "active").toLowerCase();
  if (life !== "active") {
    gates.push({
      id: "mission_lifecycle",
      label: "Mission status",
      status: "blocked",
      detail: `Mission is ${life}; deferred or cancelled missions cannot start a trip.`,
    });
    return {
      ok: false,
      gates,
      missionProfile: String(m.mission_profile || MISSION_PROFILE.LOCAL),
      missionBlockedReason: life,
    };
  }

  if (String(m.approval_status || "").toLowerCase() !== "approved") {
    gates.push({
      id: "mission_approval",
      label: "Mission approval",
      status: "blocked",
      detail: "Mission is not approved.",
    });
    return {
      ok: false,
      gates,
      missionProfile: String(m.mission_profile || MISSION_PROFILE.LOCAL),
      missionBlockedReason: "not_approved",
    };
  }

  const assigned = String(m.assigned_vehicle_id || "").trim();
  if (!assigned || assigned !== input.vehicleId) {
    gates.push({
      id: "mission_vehicle",
      label: "Reserved vehicle",
      status: "blocked",
      detail: "Trip vehicle must match the mission’s assigned (reserved) vehicle.",
    });
    return {
      ok: false,
      gates,
      missionProfile: String(m.mission_profile || MISSION_PROFILE.LOCAL),
      missionBlockedReason: "vehicle_mismatch",
    };
  }

  const profile = String(m.mission_profile || MISSION_PROFILE.LOCAL).toLowerCase();
  const skipDvc = profile === MISSION_PROFILE.LOCAL;

  const missionCalendarEndDay = missionWindowEndDate(String(m.departure_date || ""), m.return_date) || undefined;
  const plannedDepartureDate = String(m.departure_date || "").slice(0, 10) || undefined;

  const r = evaluateTripReadiness(db, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    missionProfile: m.mission_profile,
    checkDate: input.checkDate,
    referenceNow: input.referenceNow,
    skipDriverChecklist: skipDvc,
    /** Approved mission unchanged: operational + driver checklist only (no extra mechanical gate here). */
    skipMechanicalInspection: true,
    missionCalendarEndDay,
    plannedDepartureDate,
  });

  return { ok: r.ok, gates: r.gates, missionProfile: r.missionProfile };
}
