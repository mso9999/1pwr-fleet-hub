import type Database from "better-sqlite3";

/** Inclusive calendar date overlap (YYYY-MM-DD). */
export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = aStart.slice(0, 10);
  const ae = (aEnd || as).slice(0, 10);
  const bs = bStart.slice(0, 10);
  const be = (bEnd || bs).slice(0, 10);
  return as <= be && bs <= ae;
}

export interface ReservationConflict {
  reservationId: string;
  missionId: string;
  startDate: string;
  endDate: string;
}

/**
 * Active reservations for this vehicle overlapping [startDate, endDate], excluding a mission id.
 */
export function findActiveReservationConflicts(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  startDate: string,
  endDate: string,
  excludeMissionId: string
): ReservationConflict[] {
  const rows = db
    .prepare(
      `
    SELECT vr.id as reservation_id, vr.mission_id, vr.start_date, vr.end_date
    FROM vehicle_reservations vr
    JOIN missions m ON m.id = vr.mission_id
    WHERE vr.organization_id = ?
      AND vr.vehicle_id = ?
      AND vr.status = 'active'
      AND lower(COALESCE(m.lifecycle_status, 'active')) = 'active'
      AND lower(COALESCE(m.approval_status, '')) = 'approved'
      AND m.id != ?
  `
    )
    .all(organizationId, vehicleId, excludeMissionId) as Array<{
    reservation_id: string;
    mission_id: string;
    start_date: string;
    end_date: string;
  }>;

  const out: ReservationConflict[] = [];
  for (const r of rows) {
    if (dateRangesOverlap(r.start_date, r.end_date, startDate, endDate)) {
      out.push({
        reservationId: r.reservation_id,
        missionId: r.mission_id,
        startDate: r.start_date,
        endDate: r.end_date,
      });
    }
  }
  return out;
}

/** Vehicle statuses assignable when mission departure is strictly in the future (not today). */
export const FUTURE_MISSION_RESERVABLE_STATUSES = new Set([
  "operational",
  "deployed",
  "maintenance-hq",
  "maintenance-3rdparty",
]);

/** Today = calendar date in UTC (v1); org TZ can refine later. */
export function isMissionDepartureToday(departureDateIso: string, reference: Date = new Date()): boolean {
  const d = String(departureDateIso || "").slice(0, 10);
  if (!d) return false;
  return d === reference.toISOString().slice(0, 10);
}

export function vehicleStatusAllowedForReservation(
  vehicleStatus: string,
  departureDate: string,
  reference: Date = new Date()
): boolean {
  if (isMissionDepartureToday(departureDate, reference)) {
    return vehicleStatus === "operational";
  }
  return FUTURE_MISSION_RESERVABLE_STATUSES.has(vehicleStatus);
}
