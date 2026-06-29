import type Database from "better-sqlite3";

/** Minimum displacement (meters) from the trip's departure point to count as "moved". */
const FIRST_MOVEMENT_RADIUS_M = 200;
/** Minimum GPS speed (km/h) to count as "moved" even if still near departure point. */
const FIRST_MOVEMENT_SPEED_KMH = 5;
/** How many days of GPS snapshots to scan when looking for first movement. */
const MOVEMENT_SCAN_DAYS = 3;

export interface DepartureDiscrepancyResult {
  /** True when the vehicle only moved on a calendar day after the planned departure date. */
  discrepancy: boolean;
  /** Reason string suitable for UI display and audit log. */
  detail: string;
  /** ISO timestamp of the first detected movement, if any. */
  firstMovedAt: string | null;
  /** ISO timestamp of the last stationary reading at/near the departure point, if any. */
  lastStationaryAt: string | null;
  /** Whether the vehicle has a working tracker (imei set + snapshots found). */
  trackerAvailable: boolean;
}

function toUnix(dateStr: string): number {
  return Math.floor(Date.parse(dateStr) / 1000);
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Cross-check the vehicle's tracker history against the planned departure date.
 *
 * Scenario this catches: a team performs the pre-departure checklist on day D
 * (intending to depart HQ that day) but the tracker shows the vehicle only
 * left HQ on day D+1. We flag that as a discrepancy so reviewers can see the
 * true wheel-roll time vs the recorded inspection/checkout date.
 *
 * The check looks at `vehicle_gps_snapshots` for the vehicle, scoped to a
 * window starting at the beginning of the planned departure day. The first
 * snapshot that is > FIRST_MOVEMENT_RADIUS_M from the trip's departure point
 * (or reports speed >= FIRST_MOVEMENT_SPEED_KMH) is treated as the first
 * movement. If that movement's calendar date is after the planned departure
 * date, a discrepancy is recorded.
 */
export function evaluateTrackerDepartureDiscrepancy(
  db: Database.Database,
  input: {
    vehicleId: string;
    plannedDepartureDate: string; // YYYY-MM-DD
    /**
     * Optional departure point (lat/lng). If not provided, we use the first
     * snapshot on the planned departure day as the reference ("stationary at
     * origin") point — sufficient for the "left HQ the next day" case.
     */
    departureCoords?: { lat: number; lng: number } | null;
  }
): DepartureDiscrepancyResult {
  const plannedDay = String(input.plannedDepartureDate || "").slice(0, 10);
  if (!plannedDay) {
    return {
      discrepancy: false,
      detail: "No planned departure date on the trip; tracker cross-check skipped.",
      firstMovedAt: null,
      lastStationaryAt: null,
      trackerAvailable: false,
    };
  }

  const vehicle = db
    .prepare("SELECT tracker_imei, tracker_status FROM vehicles WHERE id = ?")
    .get(input.vehicleId) as
    | { tracker_imei: string | null; tracker_status: string | null }
    | undefined;
  const hasTracker =
    !!vehicle &&
    !!vehicle.tracker_imei &&
    String(vehicle.tracker_imei).length > 5;

  const windowStartUnix = toUnix(`${plannedDay}T00:00:00Z`);
  const windowEndUnix =
    windowStartUnix + MOVEMENT_SCAN_DAYS * 24 * 60 * 60;

  const rows = db
    .prepare(
      `SELECT lat, lng, source_ts, speed
       FROM vehicle_gps_snapshots
       WHERE vehicle_id = ? AND source_ts >= ? AND source_ts <= ?
       ORDER BY source_ts ASC`
    )
    .all(input.vehicleId, windowStartUnix, windowEndUnix) as Array<{
    lat: number;
    lng: number;
    source_ts: number;
    speed: number;
  }>;

  if (!hasTracker || rows.length === 0) {
    return {
      discrepancy: false,
      detail: hasTracker
        ? "Tracker configured but no GPS history found for the planned departure window; cross-check inconclusive."
        : "Vehicle has no working tracker; tracker cross-check skipped.",
      firstMovedAt: null,
      lastStationaryAt: null,
      trackerAvailable: hasTracker ?? false,
    };
  }

  const origin =
    input.departureCoords ??
    { lat: rows[0].lat, lng: rows[0].lng };

  let firstMoved: { source_ts: number; lat: number; lng: number } | null = null;
  let lastStationary: { source_ts: number } | null = null;

  for (const r of rows) {
    const movedFar = haversineMeters(origin, { lat: r.lat, lng: r.lng }) > FIRST_MOVEMENT_RADIUS_M;
    const movingFast = (r.speed ?? 0) >= FIRST_MOVEMENT_SPEED_KMH;
    if (movedFar || movingFast) {
      firstMoved = { source_ts: r.source_ts, lat: r.lat, lng: r.lng };
      break;
    }
    lastStationary = { source_ts: r.source_ts };
  }

  if (!firstMoved) {
    return {
      discrepancy: false,
      detail: `Tracker shows ${vehicle?.tracker_imei ?? "vehicle"} remained near the departure point through the planned departure window; no movement detected yet.`,
      firstMovedAt: null,
      lastStationaryAt: lastStationary
        ? new Date(lastStationary.source_ts * 1000).toISOString()
        : null,
      trackerAvailable: true,
    };
  }

  const firstMovedDate = new Date(firstMoved.source_ts * 1000);
  const firstMovedDay = firstMovedDate.toISOString().slice(0, 10);
  const discrepancy = firstMovedDay > plannedDay;

  return {
    discrepancy,
    detail: discrepancy
      ? `Planned departure ${plannedDay}, but tracker first moved on ${firstMovedDay} at ${firstMovedDate.toISOString()}. Vehicle did not leave on the inspection date.`
      : `Tracker confirms first movement on ${firstMovedDay} at ${firstMovedDate.toISOString()}, matching the planned departure date.`,
    firstMovedAt: firstMovedDate.toISOString(),
    lastStationaryAt: lastStationary
      ? new Date(lastStationary.source_ts * 1000).toISOString()
      : null,
    trackerAvailable: true,
  };
}
