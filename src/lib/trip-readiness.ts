import type Database from "better-sqlite3";
import { registrationDiscMissionBlocked } from "@/lib/registration-disc";

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

/**
 * A departing driver checklist is considered valid for this many hours after it
 * was performed. Covers the common case where the team inspects the evening
 * before and departs the next morning.
 */
export const DVC_VALIDITY_WINDOW_HOURS = 24;

export interface TripReadinessInput {
  organizationId: string;
  vehicleId: string;
  /** `local` | `field`; unknown values treated as `local`. */
  missionProfile: string | undefined;
  /** Calendar day for DVC match (YYYY-MM-DD). Defaults to UTC date of `referenceNow`. */
  checkDate?: string;
  /** For tests / deterministic checks. */
  referenceNow?: Date;
  /** When true (e.g. local / HQ-vicinity mission), departing driver checklist gate is skipped as satisfied. */
  skipDriverChecklist?: boolean;
  /** When true, skip field-deployment mechanical inspection gate (mission already management-approved as-is). */
  skipMechanicalInspection?: boolean;
  /** When set (YYYY-MM-DD), registration disc must cover this day or the gate blocks (unless trip override). */
  missionCalendarEndDay?: string;
  /**
   * Planned departure date (YYYY-MM-DD) — typically the mission's departure_date.
   * When set, a DVC whose `valid_for_departure_on` matches this day counts as
   * satisfying the gate even if `checkDate` (today) differs.
   */
  plannedDepartureDate?: string;
  /**
   * When true, the mission flagged that assets/equipment are being moved and
   * the loadout-manifest gate runs: it blocks checkout until at least one AM
   * manifest is linked. `linkedManifestIds` provides the linked manifest doc
   * ids stored on the mission pre-checkout.
   */
  assetsBeingMoved?: boolean;
  linkedManifestIds?: string[];
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
      "SELECT id, code, status, organization_id, registration_disc_expiry_date FROM vehicles WHERE id = ?"
    )
    .get(input.vehicleId) as
    | {
        id: string;
        code: string;
        status: string;
        organization_id: string;
        registration_disc_expiry_date: string | null;
      }
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

  const discEnd = String(input.missionCalendarEndDay || "").trim().slice(0, 10);
  if (discEnd) {
    const discBlocked = registrationDiscMissionBlocked(discEnd, vehicle.registration_disc_expiry_date);
    gates.push({
      id: "registration_disc",
      label: "Registration disc",
      status: discBlocked ? "blocked" : "satisfied",
      detail: discBlocked
        ? `${vehicle.code}: trip/mission extends to ${discEnd} but the registration disc expires ${String(vehicle.registration_disc_expiry_date || "").slice(0, 10)}. Ask a manager or PR approver to override, or renew the disc.`
        : vehicle.registration_disc_expiry_date
          ? `${vehicle.code}: disc valid through ${String(vehicle.registration_disc_expiry_date).slice(0, 10)} for this window.`
          : `${vehicle.code}: no registration disc expiry on file for this window.`,
    });
  }

  const dvc = db
    .prepare(
      `SELECT id, overall_pass, has_exceptions, exception_approved, check_date, valid_for_departure_on, created_at
       FROM driver_vehicle_checks
       WHERE organization_id = ? AND vehicle_id = ? AND direction = 'departing'
       ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .get(input.organizationId, input.vehicleId) as
    | {
        id: string;
        overall_pass: number;
        has_exceptions: number;
        exception_approved: number;
        check_date: string;
        valid_for_departure_on: string | null;
        created_at: string;
      }
    | undefined;

  const dvcPass =
    !!dvc &&
    (dvc.overall_pass === 1 ||
      (dvc.has_exceptions === 1 && dvc.exception_approved === 1));

  // A passing check still has to be "current". Accept it when any of:
  //   - it was performed on today's checkDate, OR
  //   - it was tagged valid_for_departure_on = planned departure date, OR
  //   - it was created within the DVC validity window (covers evening-before / morning-after).
  const plannedDay = String(input.plannedDepartureDate || "").slice(0, 10);
  const validForDay = String(dvc?.valid_for_departure_on || "").slice(0, 10);
  const dvcCheckDay = String(dvc?.check_date || "").slice(0, 10);
  const createdMs = dvc?.created_at ? Date.parse(dvc.created_at) : NaN;
  const withinWindow =
    Number.isFinite(createdMs) &&
    now.getTime() - createdMs <= DVC_VALIDITY_WINDOW_HOURS * 60 * 60 * 1000;
  const dvcCurrent = !!dvc && (dvcCheckDay === checkDate || validForDay === plannedDay || withinWindow);

  const skipDvc = input.skipDriverChecklist === true;
  const dvcGateOk = skipDvc || (dvcPass && dvcCurrent);
  const dvcDetail = skipDvc
    ? "Not required for this mission profile (local / HQ-vicinity)."
    : !dvc
      ? `Complete a departing driver checklist for ${vehicle.code} for ${checkDate} on the Vehicle checks page (pass all lines, or get manager approval for exceptions).`
      : !dvcPass
        ? `Complete a departing driver checklist for ${vehicle.code} for ${checkDate} (pass all lines, or get manager approval for exceptions).`
        : !dvcCurrent
          ? `The last departing checklist for ${vehicle.code} was on ${dvcCheckDay} and is outside the ${DVC_VALIDITY_WINDOW_HOURS}h validity window. Re-inspect before departing${
              plannedDay ? ` (planned departure ${plannedDay})` : ""
            }, or tag the check as valid for the departure date.`
          : plannedDay && validForDay === plannedDay
            ? `Departing checklist performed ${dvcCheckDay} covers planned departure ${plannedDay} (pass or approved exceptions).`
            : "Today's departing driver checklist is complete (pass or approved exceptions).";
  gates.push({
    id: "driver_checklist",
    label: "Driver checklist (departing)",
    status: dvcGateOk ? "satisfied" : "blocked",
    detail: dvcDetail,
  });

  if (missionProfile === MISSION_PROFILE.FIELD && input.skipMechanicalInspection !== true) {
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

  // Loadout manifest gate: when the mission flagged assets being moved, at
  // least one AM loadout manifest must be linked (by doc id on the mission)
  // before checkout. The manifest content lives in AM; FM only enforces the
  // link exists. See API/FM_LOADOUT_MANIFEST_INTEGRATION.md.
  if (input.assetsBeingMoved) {
    const linkedIds = Array.isArray(input.linkedManifestIds)
      ? input.linkedManifestIds.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      : [];
    const manifestOk = linkedIds.length > 0;
    gates.push({
      id: "loadout_manifest",
      label: "Loadout manifest (assets moved)",
      status: manifestOk ? "satisfied" : "blocked",
      detail: manifestOk
        ? `${linkedIds.length} AM loadout manifest${linkedIds.length === 1 ? "" : "s"} linked.`
        : `This mission moves assets/equipment. Link at least one AM loadout manifest (paste the manifest document id on the mission) before checkout. Open AM at https://am.1pwrafrica.com/loadout to create one.`,
    });
  }

  const ok = gates.every((g) => g.status === "satisfied");
  return { ok, gates, missionProfile };
}
