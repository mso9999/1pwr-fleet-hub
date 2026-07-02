import type Database from "better-sqlite3";
import { evaluateTripReadiness, MISSION_PROFILE, type ReadinessGate } from "@/lib/trip-readiness";
import { missionWindowEndDate } from "@/lib/registration-disc";

export interface MissionTripReadinessResult {
  ok: boolean;
  gates: ReadinessGate[];
  missionProfile: string;
  missionBlockedReason?: string;
  /** Scenario B: 'public_transport' = team travelling by public transport
   *  (no company vehicle). 'company_vehicle' (default) = standard flow.
   *  Callers branch on this to decide whether a vehicleId is required. */
  transportMode: "company_vehicle" | "public_transport";
}

/**
 * Readiness when starting a trip linked to an approved mission with an assigned vehicle.
 *
 * Scenario B (2026-07): when the mission's `transport_mode` is
 * `public_transport`, vehicle-related gates (mission_vehicle, vehicle
 * operational, driver checklist, mechanical inspection, registration disc)
 * are skipped — the team is travelling by public transport, not a 1PWR
 * vehicle. The mission's approval + lifecycle gates still apply.
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
              departure_date, return_date, transport_mode
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
        transport_mode?: string | null;
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
    return {
      ok: false,
      gates,
      missionProfile: MISSION_PROFILE.LOCAL,
      missionBlockedReason: "not_found",
      transportMode: "company_vehicle",
    };
  }

  const transportMode: "company_vehicle" | "public_transport" =
    String(m.transport_mode || "company_vehicle").toLowerCase() === "public_transport"
      ? "public_transport"
      : "company_vehicle";

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
      transportMode,
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
      transportMode,
    };
  }

  // Public-transport missions skip all vehicle-related gates. The team is
  // travelling by public transport, not a 1PWR vehicle, so:
  //   - no assigned vehicle to match
  //   - no vehicle operational / driver checklist / mechanical inspection /
  //     registration disc gates apply
  // The trip itself records the departure / return timestamps (vehicle-less).
  if (transportMode === "public_transport") {
    gates.push({
      id: "transport_mode",
      label: "Transport mode",
      status: "satisfied",
      detail: "Public-transport mission — vehicle gates skipped (justification on file).",
    });
    return {
      ok: true,
      gates,
      missionProfile: String(m.mission_profile || MISSION_PROFILE.LOCAL),
      transportMode,
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
      transportMode,
    };
  }

  // Policy (2026-07-01): every deployment must have a departing DVC on
  // record — the passenger manifest is the canonical "who is on board"
  // record HR anchors the field-deployment clock on. Previously LOCAL
  // profile missions skipped this gate; that left HR blind to local
  // deployments and let vehicles physically leave without a documented
  // manifest. The gate now applies uniformly to all mission profiles.
  const skipDvc = false;

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

  return { ok: r.ok, gates: r.gates, missionProfile: r.missionProfile, transportMode };
}
