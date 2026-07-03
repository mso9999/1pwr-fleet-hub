import type Database from "better-sqlite3";
import { evaluateTripReadiness, MISSION_PROFILE, type ReadinessGate } from "@/lib/trip-readiness";
import { missionWindowEndDate } from "@/lib/registration-disc";
import { localityGateRequired } from "@/lib/locality-gate";

export interface MissionTripReadinessResult {
  ok: boolean;
  gates: ReadinessGate[];
  missionProfile: string;
  missionBlockedReason?: string;
  /** Transport mode: 'company_vehicle' (default), 'public_transport',
   *  'third_party', or 'personal_vehicle'. Non-company modes skip vehicle
   *  gates and use a sentinel vehicle at checkout. */
  transportMode: "company_vehicle" | "public_transport" | "third_party" | "personal_vehicle";
}

/**
 * Whether a fleet-lead locality override was recorded for this mission within
 * the last 7 days. When true, the mechanical-inspection gate at checkout is
 * treated as satisfied — the fleet lead already authorized the allocation
 * without a fresh inspection, so we don't force a second override at checkout.
 */
function hasRecentLocalityOverride(db: Database.Database, missionId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM record_mutation_log
       WHERE entity_type = 'mission' AND entity_id = ?
         AND action = 'prerequisite_override'
         AND after_json LIKE '%mechanical_inspection_locality%'
         AND datetime(created_at) >= datetime('now', '-7 days')
       LIMIT 1`
    )
    .get(missionId) as { 1: number } | undefined;
  return !!row;
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
              departure_date, return_date, transport_mode, destination,
              assets_being_moved, linked_manifest_ids
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
        destination?: string | null;
        assets_being_moved?: number | null;
        linked_manifest_ids?: string | null;
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

  type TransportMode = "company_vehicle" | "public_transport" | "third_party" | "personal_vehicle";
  const tmRaw = String(m.transport_mode || "company_vehicle").toLowerCase();
  const transportMode: TransportMode =
    tmRaw === "public_transport" || tmRaw === "third_party" || tmRaw === "personal_vehicle"
      ? (tmRaw as TransportMode)
      : "company_vehicle";
  const isNonCompany = transportMode !== "company_vehicle";

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

  // Non-company-vehicle missions skip all vehicle-related gates. The team is
  // travelling by public / third-party / personal transport, not a 1PWR
  // vehicle, so:
  //   - no assigned vehicle to match
  //   - no vehicle operational / driver checklist / mechanical inspection /
  //     registration disc gates apply
  // The trip itself records the departure / return timestamps (vehicle-less).
  if (isNonCompany) {
    const label =
      transportMode === "public_transport"
        ? "Public-transport mission"
        : transportMode === "third_party"
          ? "Third-party transport mission"
          : "Personal-vehicle mission";
    gates.push({
      id: "transport_mode",
      label: "Transport mode",
      status: "satisfied",
      detail: `${label} — vehicle gates skipped (justification on file).`,
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

  // Locality-aware mechanical inspection gate: re-enabled conditionally.
  // The gate runs at checkout/departure only when the destination is beyond
  // LOCALITY_RADIUS_KM from the vehicle's current location AND no passing
  // detailed inspection is on file AND there's no recent fleet-lead locality
  // override on the mission (which already authorized the allocation).
  const destinationCode = String(m.destination || "").trim();
  let skipMechanicalInspection = true;
  let localityGateNote = "";
  if (destinationCode) {
    const gate = localityGateRequired(db, input.organizationId, input.vehicleId, destinationCode, input.referenceNow);
    if (gate.required && !gate.inspectionOnFile) {
      const overrideOnFile = hasRecentLocalityOverride(db, input.missionId);
      if (!overrideOnFile) {
        skipMechanicalInspection = false;
      }
      localityGateNote = overrideOnFile
        ? `Mechanical inspection locality gate: ${Math.round(gate.distanceKm ?? 0)} km (beyond locality); satisfied by recent fleet-lead override.`
        : gate.reason;
    } else if (gate.required && gate.inspectionOnFile) {
      localityGateNote = `Mechanical inspection locality gate: ${Math.round(gate.distanceKm ?? 0)} km (beyond locality); passing detailed inspection on file.`;
    }
  }

  let linkedManifestIds: string[] = [];
  try {
    const parsed = JSON.parse(String(m.linked_manifest_ids || "[]")) as unknown;
    if (Array.isArray(parsed)) {
      linkedManifestIds = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    linkedManifestIds = [];
  }
  const assetsBeingMoved = !!m.assets_being_moved;

  const r = evaluateTripReadiness(db, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    missionProfile: m.mission_profile,
    checkDate: input.checkDate,
    referenceNow: input.referenceNow,
    skipDriverChecklist: skipDvc,
    skipMechanicalInspection,
    missionCalendarEndDay,
    plannedDepartureDate,
    assetsBeingMoved,
    linkedManifestIds,
  });

  // Surface the locality gate context as an extra gate so the checkout UI can
  // show why the mechanical inspection is being required (or that it's satisfied).
  if (localityGateNote) {
    r.gates.push({
      id: "locality_mechanical",
      label: "Mechanical inspection (locality)",
      status: skipMechanicalInspection ? "satisfied" : "blocked",
      detail: localityGateNote,
    });
  }

  return { ok: r.ok, gates: r.gates, missionProfile: r.missionProfile, transportMode };
}
