import type Database from "better-sqlite3";

/** Short local runs vs multi-day field deployments — drives checklist + inspection rules. */
export const MISSION_PROFILE = {
  LOCAL: "local",
  FIELD: "field",
} as const;

export type MissionProfile = (typeof MISSION_PROFILE)[keyof typeof MISSION_PROFILE];

export type ReadinessGateStatus = "satisfied" | "blocked";

export interface ReadinessGate {
  id: string;
  label: string;
  status: ReadinessGateStatus;
  detail: string;
}

/** Detailed mechanical inspection counts toward field-deployment requirement. */
export const FIELD_DEPLOYMENT_INSPECTION_TYPES = ["detailed"] as const;

/** Inspection must be no older than this many days before checkout. */
export const MECHANICAL_INSPECTION_MAX_AGE_DAYS = 14;

export interface TripReadinessInput {
  organizationId: string;
  vehicleId: string;
  /** `local` | `field`; unknown values treated as `local`. */
  missionProfile: string | undefined;
  /** Calendar day for DVC match (YYYY-MM-DD). Defaults to UTC date of `referenceNow`. */
  checkDate?: string;
  /** For tests / deterministic checks. */
  referenceNow?: Date;
}

function normalizeProfile(raw: string | undefined): MissionProfile {
  const s = String(raw || "").toLowerCase().trim();
  return s === MISSION_PROFILE.FIELD ? MISSION_PROFILE.FIELD : MISSION_PROFILE.LOCAL;
}

export function evaluateTripReadiness(
  db: Database.Database,
  input: TripReadinessInput
): { ok: boolean; gates: ReadinessGate[]; missionProfile: MissionProfile } {
  const missionProfile = normalizeProfile(input.missionProfile);
  const now = input.referenceNow ?? new Date();
  const checkDate =
    input.checkDate ?? now.toISOString().slice(0, 10);

  const gates: ReadinessGate[] = [];

  const vehicle = db
    .prepare(
      "SELECT id, code, status, organization_id FROM vehicles WHERE id = ?"
    )
    .get(input.vehicleId) as
    | { id: string; code: string; status: string; organization_id: string }
    | undefined;

  if (!vehicle) {
    gates.push({
      id: "vehicle",
      label: "Vehicle",
      status: "blocked",
      detail: "Vehicle not found.",
    });
    return { ok: false, gates, missionProfile };
  }

  if (vehicle.organization_id !== input.organizationId) {
    gates.push({
      id: "vehicle_org",
      label: "Organization",
      status: "blocked",
      detail: "Vehicle does not belong to this organization.",
    });
    return { ok: false, gates, missionProfile };
  }

  const opOk = vehicle.status === "operational";
  gates.push({
    id: "vehicle_operational",
    label: "Vehicle available for checkout",
    status: opOk ? "satisfied" : "blocked",
    detail: opOk
      ? `${vehicle.code} is operational.`
      : `${vehicle.code} is not operational (status: ${vehicle.status}). Only operational vehicles can start a new trip.`,
  });

  const dvc = db
    .prepare(
      `SELECT id, overall_pass, has_exceptions, exception_approved
       FROM driver_vehicle_checks
       WHERE organization_id = ? AND vehicle_id = ? AND direction = 'departing' AND check_date = ?
       ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .get(input.organizationId, input.vehicleId, checkDate) as
    | {
        id: string;
        overall_pass: number;
        has_exceptions: number;
        exception_approved: number;
      }
    | undefined;

  const dvcPass =
    !!dvc &&
    (dvc.overall_pass === 1 ||
      (dvc.has_exceptions === 1 && dvc.exception_approved === 1));

  gates.push({
    id: "driver_checklist",
    label: "Driver checklist (departing)",
    status: dvcPass ? "satisfied" : "blocked",
    detail: dvcPass
      ? "Today’s departing driver checklist is complete (pass or approved exceptions)."
      : `Complete a departing driver checklist for ${vehicle.code} for ${checkDate} on the Vehicle checks page (pass all lines, or get manager approval for exceptions).`,
  });

  if (missionProfile === MISSION_PROFILE.FIELD) {
    const cutoff = new Date(now.getTime() - MECHANICAL_INSPECTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const placeholders = FIELD_DEPLOYMENT_INSPECTION_TYPES.map(() => "?").join(", ");
    const insp = db
      .prepare(
        `SELECT id, created_at, type FROM inspections
         WHERE organization_id = ? AND vehicle_id = ? AND overall_pass = 1
           AND type IN (${placeholders})
           AND created_at >= ?
         ORDER BY datetime(created_at) DESC LIMIT 1`
      )
      .get(
        input.organizationId,
        input.vehicleId,
        ...FIELD_DEPLOYMENT_INSPECTION_TYPES,
        cutoff
      ) as { id: string; created_at: string; type: string } | undefined;

    const inspOk = !!insp;
    gates.push({
      id: "mechanical_inspection",
      label: "Mechanical inspection (deployment)",
      status: inspOk ? "satisfied" : "blocked",
      detail: inspOk
        ? `Detailed inspection on file (${insp.type}, ${insp.created_at.slice(0, 10)}).`
        : `Field deployments require a passing detailed mechanical inspection within the last ${MECHANICAL_INSPECTION_MAX_AGE_DAYS} days. Record one on Inspections for ${vehicle.code}.`,
    });
  }

  const ok = gates.every((g) => g.status === "satisfied");
  return { ok, gates, missionProfile };
}
