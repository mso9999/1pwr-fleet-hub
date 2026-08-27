import type Database from "better-sqlite3";
import { isUnallocatedVehicleId, syncAllocatedVehicleToPlannedTrip } from "@/lib/mission-checkout";
import { tripDateWithinMissionWindow } from "@/lib/pvr-mission";

export const MISSION_SELECTION_PREFIX = "mission:";

export type EligibleDepartureTrip = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  mission_id: string;
  driver_name: string | null;
  departure_location: string | null;
  destination: string | null;
  checkout_at: string | null;
  planned_departure_date: string | null;
  departed_at: string | null;
  checkin_at: string | null;
  mission_type: string | null;
  trip_shape: string | null;
  mission_title: string | null;
  mission_approval_status: string | null;
  mission_lifecycle_status: string | null;
  mission_departure_date: string | null;
  mission_return_date: string | null;
  vehicle_code: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  selection_kind: "trip" | "mission";
};

/**
 * Calendar YYYY-MM-DD for the organisation. `organizations.timezone_offset` is
 * hours from UTC (Lesotho default +2). Using UTC-only "today" hid same-day
 * missions after 22:00 LS and, conversely, could disagree with the DVC form's
 * local date label.
 */
export function organizationCalendarDate(
  db: Database.Database,
  organizationId: string,
  referenceNow: Date = new Date()
): string {
  const row = db
    .prepare("SELECT timezone_offset FROM organizations WHERE id = ?")
    .get(organizationId) as { timezone_offset?: number | null } | undefined;
  const offsetHours = Number.isFinite(Number(row?.timezone_offset))
    ? Number(row?.timezone_offset)
    : 2;
  const shifted = new Date(referenceNow.getTime() + offsetHours * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function isMissionSelectionId(raw: string | null | undefined): boolean {
  return String(raw || "").startsWith(MISSION_SELECTION_PREFIX);
}

export function parseDepartureSelectionId(raw: string | null | undefined): {
  tripId: string;
  missionId: string;
} {
  const s = String(raw || "").trim();
  if (!s) return { tripId: "", missionId: "" };
  if (s.startsWith(MISSION_SELECTION_PREFIX)) {
    return { tripId: "", missionId: s.slice(MISSION_SELECTION_PREFIX.length).trim() };
  }
  return { tripId: s, missionId: "" };
}

export function missionSelectionId(missionId: string): string {
  return `${MISSION_SELECTION_PREFIX}${missionId}`;
}

function missionTouchesCalendarDay(
  departureDate: string | null | undefined,
  returnDate: string | null | undefined,
  today: string
): boolean {
  const dep = String(departureDate || "").slice(0, 10);
  const ret = String(returnDate || "").slice(0, 10);
  if (tripDateWithinMissionWindow(today, dep, ret || dep)) return true;
  // Evening-before departing checks (24h DVC window) for a tomorrow departure.
  const [y, m, d] = today.split("-").map((n) => Number(n));
  if (!y || !m || !d) return false;
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return dep === tomorrow;
}

function companyVehicleMode(raw: string | null | undefined): boolean {
  const tm = String(raw || "company_vehicle").toLowerCase();
  return tm !== "public_transport" && tm !== "third_party" && tm !== "personal_vehicle";
}

function vehicleMatchesMission(
  vehicleId: string,
  assignedVehicleId: string | null | undefined,
  reservedVehicleId: string | null | undefined
): boolean {
  return assignedVehicleId === vehicleId || reservedVehicleId === vehicleId;
}

/**
 * Keep the planned trip's vehicle_id in sync with the mission reservation so
 * the DVC picker (which keys off the physical unit the driver selected) can
 * see the approved mission. Allocation via the legacy vehicle-request assign
 * path previously wrote missions.assigned_vehicle_id but left the trip on the
 * UNALLOCATED sentinel.
 */
export function healPlannedTripVehicleForAssignedMissions(
  db: Database.Database,
  organizationId: string,
  vehicleId: string
): void {
  const rows = db
    .prepare(
      `SELECT m.id
         FROM missions m
        WHERE m.organization_id = ?
          AND lower(m.approval_status) = 'approved'
          AND lower(coalesce(m.lifecycle_status, 'active')) = 'active'
          AND (
            m.assigned_vehicle_id = ?
            OR EXISTS (
              SELECT 1 FROM vehicle_reservations vr
               WHERE vr.mission_id = m.id
                 AND vr.vehicle_id = ?
                 AND vr.status = 'active'
            )
          )`
    )
    .all(organizationId, vehicleId, vehicleId) as Array<{ id: string }>;
  for (const row of rows) {
    syncAllocatedVehicleToPlannedTrip(db, row.id, vehicleId);
  }
}

type MissionHintRow = {
  id: string;
  title: string;
  destination: string;
  assigned_vehicle_id: string | null;
  assigned_vehicle_code: string | null;
  reserved_vehicle_id: string | null;
  reserved_vehicle_code: string | null;
  departure_date: string;
  return_date: string;
};

function approvedMissionsTouchingToday(
  db: Database.Database,
  organizationId: string,
  today: string
): MissionHintRow[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.destination, m.assigned_vehicle_id, m.departure_date, m.return_date,
              av.code AS assigned_vehicle_code,
              (
                SELECT vr.vehicle_id FROM vehicle_reservations vr
                 WHERE vr.mission_id = m.id AND vr.status = 'active'
                 ORDER BY vr.updated_at DESC LIMIT 1
              ) AS reserved_vehicle_id,
              (
                SELECT v2.code FROM vehicle_reservations vr
                JOIN vehicles v2 ON v2.id = vr.vehicle_id
                 WHERE vr.mission_id = m.id AND vr.status = 'active'
                 ORDER BY vr.updated_at DESC LIMIT 1
              ) AS reserved_vehicle_code
         FROM missions m
         LEFT JOIN vehicles av ON av.id = m.assigned_vehicle_id
        WHERE m.organization_id = ?
          AND lower(m.approval_status) = 'approved'
          AND lower(coalesce(m.lifecycle_status, 'active')) = 'active'
          AND lower(coalesce(m.transport_mode, 'company_vehicle')) = 'company_vehicle'`
    )
    .all(organizationId) as MissionHintRow[];
  return rows.filter((row) =>
    missionTouchesCalendarDay(row.departure_date, row.return_date, today)
  );
}

export function emptyEligibleDepartureHint(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  today: string
): string | null {
  const missions = approvedMissionsTouchingToday(db, organizationId, today);
  if (missions.length === 0) return null;

  const assignedHere = missions.find((m) =>
    vehicleMatchesMission(vehicleId, m.assigned_vehicle_id, m.reserved_vehicle_id)
  );
  if (assignedHere) {
    return `Approved mission “${assignedHere.title || "Untitled"}” (${assignedHere.destination || "no destination"}) is assigned to this vehicle. Create its trip from the Trips page if it is not listed, then return here.`;
  }

  const unassigned = missions.find(
    (m) => !String(m.assigned_vehicle_id || "").trim() && !String(m.reserved_vehicle_id || "").trim()
  );
  if (unassigned) {
    return `Approved mission “${unassigned.title || "Untitled"}” (${unassigned.destination || "no destination"}) has no vehicle reserved yet. Ask fleet to allocate a vehicle, then return here.`;
  }

  const other = missions[0];
  const otherCode =
    other.assigned_vehicle_code || other.reserved_vehicle_code || "another vehicle";
  return `Approved mission “${other.title || "Untitled"}” (${other.destination || "no destination"}) is reserved for ${otherCode}, not this vehicle. Pick the reserved vehicle, or ask fleet to reassign.`;
}

function mapTripRow(
  row: Record<string, unknown>,
  kind: "trip" | "mission"
): EligibleDepartureTrip {
  const missionId = String(row.mission_id || "");
  const tripId = String(row.id || "");
  return {
    id: kind === "mission" || !tripId ? missionSelectionId(missionId) : tripId,
    organization_id: String(row.organization_id || ""),
    vehicle_id: String(row.vehicle_id || ""),
    mission_id: missionId,
    driver_name: (row.driver_name as string | null) ?? null,
    departure_location: (row.departure_location as string | null) ?? null,
    destination: (row.destination as string | null) ?? null,
    checkout_at: (row.checkout_at as string | null) ?? null,
    planned_departure_date: (row.planned_departure_date as string | null) ?? null,
    departed_at: (row.departed_at as string | null) ?? null,
    checkin_at: (row.checkin_at as string | null) ?? null,
    mission_type: (row.mission_type as string | null) ?? null,
    trip_shape: (row.trip_shape as string | null) ?? null,
    mission_title: (row.mission_title as string | null) ?? null,
    mission_approval_status: (row.mission_approval_status as string | null) ?? null,
    mission_lifecycle_status: (row.mission_lifecycle_status as string | null) ?? null,
    mission_departure_date: (row.mission_departure_date as string | null) ?? null,
    mission_return_date: (row.mission_return_date as string | null) ?? null,
    vehicle_code: (row.vehicle_code as string | null) ?? null,
    vehicle_make: (row.vehicle_make as string | null) ?? null,
    vehicle_model: (row.vehicle_model as string | null) ?? null,
    selection_kind: kind,
  };
}

/**
 * Trips / approved missions a driver may attach a departing vehicle check to.
 *
 * Matches the physical vehicle they selected, not only trips.vehicle_id:
 * planned trips often still sit on the UNALLOCATED sentinel until fleet
 * allocation is synced, and drivers complete the checklist after mission
 * approval + reservation, before the trip record exists.
 */
export function listEligibleDepartureTrips(
  db: Database.Database,
  input: {
    organizationId: string;
    vehicleId: string;
    today?: string;
    referenceNow?: Date;
  }
): { trips: EligibleDepartureTrip[]; emptyHint: string | null } {
  const today =
    input.today ||
    organizationCalendarDate(db, input.organizationId, input.referenceNow ?? new Date());

  healPlannedTripVehicleForAssignedMissions(db, input.organizationId, input.vehicleId);

  const tripRows = db
    .prepare(
      `SELECT
          t.id, t.organization_id, t.vehicle_id, t.mission_id,
          t.driver_name, t.departure_location, t.destination,
          t.checkout_at, t.planned_departure_date, t.departed_at, t.checkin_at,
          t.mission_type, t.trip_shape,
          m.title            AS mission_title,
          m.approval_status  AS mission_approval_status,
          m.lifecycle_status AS mission_lifecycle_status,
          m.departure_date   AS mission_departure_date,
          m.return_date      AS mission_return_date,
          m.assigned_vehicle_id AS mission_assigned_vehicle_id,
          m.transport_mode   AS mission_transport_mode,
          v.code             AS vehicle_code,
          v.make             AS vehicle_make,
          v.model            AS vehicle_model
       FROM trips t
       JOIN missions m ON t.mission_id = m.id
       LEFT JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.organization_id = ?
         AND t.mission_id IS NOT NULL
         AND lower(m.approval_status) = 'approved'
         AND lower(coalesce(m.lifecycle_status, 'active')) = 'active'
         AND t.checkin_at IS NULL
         AND t.departed_at IS NULL
         AND (
           t.vehicle_id = ?
           OR m.assigned_vehicle_id = ?
           OR EXISTS (
             SELECT 1 FROM vehicle_reservations vr
              WHERE vr.mission_id = m.id
                AND vr.vehicle_id = ?
                AND vr.status = 'active'
           )
         )
       ORDER BY
          CASE WHEN t.planned_departure_date IS NULL THEN 1 ELSE 0 END,
          t.planned_departure_date DESC,
          t.checkout_at DESC
       LIMIT 50`
    )
    .all(
      input.organizationId,
      input.vehicleId,
      input.vehicleId,
      input.vehicleId
    ) as Array<Record<string, unknown>>;

  const trips: EligibleDepartureTrip[] = [];
  const seenMissionIds = new Set<string>();
  for (const row of tripRows) {
    if (!companyVehicleMode(row.mission_transport_mode as string | null)) continue;
    const assigned = String(row.mission_assigned_vehicle_id || "");
    const tripVehicle = String(row.vehicle_id || "");
    // After heal, unallocated trips for a different assigned vehicle should
    // not appear. Keep rows whose physical vehicle is this unit, or whose
    // mission reservation is this unit (including a still-unallocated trip).
    const matches =
      tripVehicle === input.vehicleId ||
      assigned === input.vehicleId ||
      (isUnallocatedVehicleId(tripVehicle) && assigned === input.vehicleId);
    if (!matches) continue;
    const mapped = mapTripRow(row, "trip");
    trips.push(mapped);
    if (mapped.mission_id) seenMissionIds.add(mapped.mission_id);
  }

  const missionRows = db
    .prepare(
      `SELECT
          m.id AS mission_id,
          m.organization_id,
          COALESCE(m.assigned_vehicle_id, '') AS vehicle_id,
          m.departure_location,
          m.destination,
          m.departure_date AS planned_departure_date,
          m.departure_date AS mission_departure_date,
          m.return_date AS mission_return_date,
          m.mission_type,
          m.trip_shape,
          m.title AS mission_title,
          m.approval_status AS mission_approval_status,
          m.lifecycle_status AS mission_lifecycle_status,
          m.transport_mode AS mission_transport_mode,
          m.assigned_vehicle_id AS mission_assigned_vehicle_id,
          m.trip_id AS mission_trip_id,
          v.code AS vehicle_code,
          v.make AS vehicle_make,
          v.model AS vehicle_model,
          (
            SELECT vr.vehicle_id FROM vehicle_reservations vr
             WHERE vr.mission_id = m.id AND vr.status = 'active'
             ORDER BY vr.updated_at DESC LIMIT 1
          ) AS reserved_vehicle_id
       FROM missions m
       LEFT JOIN vehicles v ON v.id = m.assigned_vehicle_id
      WHERE m.organization_id = ?
        AND lower(m.approval_status) = 'approved'
        AND lower(coalesce(m.lifecycle_status, 'active')) = 'active'
        AND lower(coalesce(m.transport_mode, 'company_vehicle')) = 'company_vehicle'
        AND (
          m.assigned_vehicle_id = ?
          OR EXISTS (
            SELECT 1 FROM vehicle_reservations vr
             WHERE vr.mission_id = m.id
               AND vr.vehicle_id = ?
               AND vr.status = 'active'
          )
        )`
    )
    .all(input.organizationId, input.vehicleId, input.vehicleId) as Array<Record<string, unknown>>;

  for (const row of missionRows) {
    const missionId = String(row.mission_id || "");
    if (!missionId || seenMissionIds.has(missionId)) continue;
    if (!missionTouchesCalendarDay(
      row.mission_departure_date as string,
      row.mission_return_date as string,
      today
    )) {
      continue;
    }
    const tripId = String(row.mission_trip_id || "").trim();
    if (tripId) {
      const existing = db
        .prepare("SELECT departed_at, checkin_at FROM trips WHERE id = ?")
        .get(tripId) as { departed_at: string | null; checkin_at: string | null } | undefined;
      if (existing && !existing.checkin_at && !existing.departed_at) {
        // Open trip exists but was not returned above — still surface the mission.
      } else if (existing && !existing.checkin_at) {
        continue;
      }
    }
    trips.push(
      mapTripRow(
        {
          ...row,
          id: "",
          driver_name: null,
          checkout_at: null,
          departed_at: null,
          checkin_at: null,
        },
        "mission"
      )
    );
    seenMissionIds.add(missionId);
  }

  return {
    trips,
    emptyHint: trips.length === 0 ? emptyEligibleDepartureHint(db, input.organizationId, input.vehicleId, today) : null,
  };
}

export function assertMissionEligibleForDepartingCheck(
  db: Database.Database,
  input: {
    organizationId: string;
    missionId: string;
    vehicleId: string;
    today?: string;
  }
): { ok: true; mission: Record<string, unknown> } | { ok: false; error: string; reason: string } {
  const mission = db
    .prepare(
      `SELECT id, organization_id, title, destination, departure_location, departure_date, return_date,
              approval_status, lifecycle_status, assigned_vehicle_id, transport_mode, trip_id
         FROM missions WHERE id = ?`
    )
    .get(input.missionId) as Record<string, unknown> | undefined;
  if (!mission || String(mission.organization_id) !== input.organizationId) {
    return { ok: false, error: "Selected mission was not found for this organisation.", reason: "mission_not_found" };
  }
  if (String(mission.approval_status || "").toLowerCase() !== "approved") {
    return {
      ok: false,
      error: `Mission is ${mission.approval_status || "pending"} — not approved. A manager must approve the mission before this vehicle can deploy.`,
      reason: "mission_not_approved",
    };
  }
  if (String(mission.lifecycle_status || "active").toLowerCase() !== "active") {
    return {
      ok: false,
      error: `Mission lifecycle is ${mission.lifecycle_status}. Only active missions can deploy.`,
      reason: "mission_not_active",
    };
  }
  if (!companyVehicleMode(mission.transport_mode as string | null)) {
    return {
      ok: false,
      error:
        "This trip is on a public-transport mission — no driver-vehicle-check is required or allowed. The trip checkout is the deployment record.",
      reason: "public_transport_mission_no_dvc",
    };
  }
  const assigned = String(mission.assigned_vehicle_id || "").trim();
  const reserved = db
    .prepare(
      `SELECT vehicle_id FROM vehicle_reservations
        WHERE mission_id = ? AND status = 'active'
        ORDER BY updated_at DESC LIMIT 1`
    )
    .get(input.missionId) as { vehicle_id?: string } | undefined;
  const reservedId = String(reserved?.vehicle_id || "").trim();
  if (!vehicleMatchesMission(input.vehicleId, assigned, reservedId)) {
    return {
      ok: false,
      error: "Selected mission is reserved for a different vehicle. Pick the mission matching this vehicle.",
      reason: "vehicle_mismatch",
    };
  }
  const today = input.today || organizationCalendarDate(db, input.organizationId);
  if (!missionTouchesCalendarDay(mission.departure_date as string, mission.return_date as string, today)) {
    return {
      ok: false,
      error: `Mission “${mission.title || ""}” is approved but not scheduled for today (${String(mission.departure_date || "").slice(0, 10)}–${String(mission.return_date || mission.departure_date || "").slice(0, 10)}).`,
      reason: "mission_not_today",
    };
  }
  return { ok: true, mission };
}

export function resolveDepartingCheckAnchor(
  db: Database.Database,
  input: {
    organizationId: string;
    vehicleId: string;
    selectionId: string;
    today?: string;
  }
):
  | { ok: true; tripId: string | null; missionId: string }
  | { ok: false; error: string; reason: string } {
  const parsed = parseDepartureSelectionId(input.selectionId);
  if (!parsed.tripId && !parsed.missionId) {
    return {
      ok: false,
      error:
        "An approved mission / trip is required for a departing check. Pick one from the list, or ask dispatch to log and approve a mission for this vehicle first.",
      reason: "missing_trip",
    };
  }

  if (parsed.tripId) {
    const trip = db
      .prepare(
        `SELECT t.id, t.vehicle_id, t.mission_id, t.departed_at, t.checkin_at,
                m.approval_status  AS mission_approval_status,
                m.lifecycle_status AS mission_lifecycle_status,
                m.transport_mode   AS mission_transport_mode,
                m.assigned_vehicle_id AS mission_assigned_vehicle_id
           FROM trips t
           LEFT JOIN missions m ON t.mission_id = m.id
          WHERE t.id = ?`
      )
      .get(parsed.tripId) as
      | {
          id: string;
          vehicle_id: string;
          mission_id: string | null;
          departed_at: string | null;
          checkin_at: string | null;
          mission_approval_status: string | null;
          mission_lifecycle_status: string | null;
          mission_transport_mode: string | null;
          mission_assigned_vehicle_id: string | null;
        }
      | undefined;
    if (!trip) {
      return { ok: false, error: "Selected trip no longer exists. Refresh and pick again.", reason: "trip_not_found" };
    }
    if (!companyVehicleMode(trip.mission_transport_mode)) {
      return {
        ok: false,
        error:
          "This trip is on a public-transport mission — no driver-vehicle-check is required or allowed. The trip checkout is the deployment record.",
        reason: "public_transport_mission_no_dvc",
      };
    }
    const assigned = String(trip.mission_assigned_vehicle_id || "").trim();
    const tripVehicle = String(trip.vehicle_id || "");
    const matchesVehicle =
      tripVehicle === input.vehicleId ||
      assigned === input.vehicleId ||
      (isUnallocatedVehicleId(tripVehicle) && assigned === input.vehicleId);
    if (!matchesVehicle) {
      return {
        ok: false,
        error: "Selected trip is for a different vehicle. Pick a trip matching this vehicle.",
        reason: "vehicle_mismatch",
      };
    }
    if (!trip.mission_id) {
      return {
        ok: false,
        error: "Selected trip is not linked to a mission. Dispatch must attach an approved mission before departure.",
        reason: "missing_mission",
      };
    }
    if (String(trip.mission_approval_status || "").toLowerCase() !== "approved") {
      return {
        ok: false,
        error: `Mission is ${trip.mission_approval_status || "pending"} — not approved. A manager must approve the mission before this vehicle can deploy.`,
        reason: "mission_not_approved",
      };
    }
    if (String(trip.mission_lifecycle_status || "active").toLowerCase() !== "active") {
      return {
        ok: false,
        error: `Mission lifecycle is ${trip.mission_lifecycle_status}. Only active missions can deploy.`,
        reason: "mission_not_active",
      };
    }
    if (trip.departed_at) {
      return {
        ok: false,
        error: "Selected trip has already departed. Pick the next pending trip for this vehicle.",
        reason: "trip_already_departed",
      };
    }
    if (trip.checkin_at) {
      return {
        ok: false,
        error: "Selected trip has already been checked in. Pick the next pending trip for this vehicle.",
        reason: "trip_already_checked_in",
      };
    }
    if (isUnallocatedVehicleId(tripVehicle) && assigned === input.vehicleId) {
      syncAllocatedVehicleToPlannedTrip(db, trip.mission_id, input.vehicleId);
    }
    return { ok: true, tripId: trip.id, missionId: trip.mission_id };
  }

  const missionCheck = assertMissionEligibleForDepartingCheck(db, {
    organizationId: input.organizationId,
    missionId: parsed.missionId,
    vehicleId: input.vehicleId,
    today: input.today,
  });
  if (!missionCheck.ok) return missionCheck;

  const openTrip = db
    .prepare(
      `SELECT id FROM trips
        WHERE (mission_id = ? OR id = ?)
          AND departed_at IS NULL AND checkin_at IS NULL
        ORDER BY checkout_at DESC LIMIT 1`
    )
    .get(parsed.missionId, String(missionCheck.mission.trip_id || "")) as { id: string } | undefined;
  if (openTrip) {
    syncAllocatedVehicleToPlannedTrip(db, parsed.missionId, input.vehicleId);
    return { ok: true, tripId: openTrip.id, missionId: parsed.missionId };
  }
  return { ok: true, tripId: null, missionId: parsed.missionId };
}
