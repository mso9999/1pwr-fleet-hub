import type Database from "better-sqlite3";
import { getSiteCoordsByCode, getRouteOrigin } from "@/lib/vehicle-request-fuel";

/**
 * Locality gate for vehicle allocation.
 *
 * When fleet allocates a vehicle to a mission whose destination is more than
 * LOCALITY_RADIUS_KM from the vehicle's CURRENT location, a passing detailed
 * mechanical inspection (≤ MECHANICAL_INSPECTION_MAX_AGE_DAYS old) is required
 * before the reservation is allowed — unless a fleet-lead-capable user
 * supplies an override reason.
 *
 * Vehicles without a current_location GPS fall back to the org route origin
 * (HQ). If neither resolves, the gate is skipped (returns not required) so
 * allocations aren't blocked by missing data.
 */

export const LOCALITY_RADIUS_KM = 50;
export const MECHANICAL_INSPECTION_MAX_AGE_DAYS = 14;
export const MECHANICAL_INSPECTION_TYPES = ["detailed"] as const;

interface LatLng {
  lat: number;
  lng: number;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
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
 * Returns the vehicle's current GPS: site GPS for its current_location, else
 * the org route origin (HQ), else null.
 */
export function getVehicleCurrentCoords(
  db: Database.Database,
  organizationId: string,
  vehicleId: string
): LatLng | null {
  const vehicle = db
    .prepare("SELECT current_location FROM vehicles WHERE id = ?")
    .get(vehicleId) as { current_location: string | null } | undefined;
  if (!vehicle) return null;
  const loc = String(vehicle.current_location || "").trim();
  if (loc) {
    const coords = getSiteCoordsByCode(db, organizationId, loc);
    if (coords) return coords;
  }
  return getRouteOrigin(db, organizationId);
}

/**
 * Great-circle distance in km from the vehicle's current location to the
 * destination site. Returns null if either point can't be geocoded.
 */
export function distanceVehicleToDestination(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  destinationCode: string
): number | null {
  const origin = getVehicleCurrentCoords(db, organizationId, vehicleId);
  if (!origin) return null;
  const dest = getSiteCoordsByCode(db, organizationId, destinationCode);
  if (!dest) return null;
  return haversineKm(origin, dest);
}

/**
 * Does a passing detailed mechanical inspection exist for this vehicle within
 * the max-age window? Mirrors the query in trip-readiness.ts.
 */
export function hasRecentDetailedInspection(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  referenceNow: Date = new Date()
): { exists: boolean; inspectionId: string | null; createdAt: string | null } {
  const cutoff = new Date(
    referenceNow.getTime() - MECHANICAL_INSPECTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const placeholders = MECHANICAL_INSPECTION_TYPES.map(() => "?").join(", ");
  const insp = db
    .prepare(
      `SELECT id, created_at FROM inspections
       WHERE organization_id = ? AND vehicle_id = ? AND overall_pass = 1
         AND type IN (${placeholders})
         AND created_at >= ?
       ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .get(
      organizationId,
      vehicleId,
      ...MECHANICAL_INSPECTION_TYPES,
      cutoff
    ) as { id: string; created_at: string } | undefined;
  return {
    exists: !!insp,
    inspectionId: insp?.id ?? null,
    createdAt: insp?.created_at ?? null,
  };
}

export interface LocalityGateResult {
  /** True when the destination is beyond the radius and a mechanical inspection is required. */
  required: boolean;
  /** Distance in km, or null when it could not be computed. */
  distanceKm: number | null;
  /** True when a passing detailed inspection is already on file within the age window. */
  inspectionOnFile: boolean;
  /** Human-readable reason for UI / error responses. */
  reason: string;
}

/**
 * Decides whether the locality gate blocks a vehicle reservation.
 *
 * - `required: true, inspectionOnFile: false` → blocks until inspection or override.
 * - `required: true, inspectionOnFile: true`  → gate satisfied, do not block.
 * - `required: false`                         → outside-radius (local) allocation, no inspection needed.
 */
export function localityGateRequired(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  destinationCode: string,
  referenceNow?: Date
): LocalityGateResult {
  const distanceKm = distanceVehicleToDestination(db, organizationId, vehicleId, destinationCode);
  if (distanceKm === null) {
    return {
      required: false,
      distanceKm: null,
      inspectionOnFile: false,
      reason:
        "Distance to destination could not be computed (missing GPS on vehicle location or destination); locality gate skipped.",
    };
  }
  if (distanceKm <= LOCALITY_RADIUS_KM) {
    return {
      required: false,
      distanceKm,
      inspectionOnFile: false,
      reason: `Destination is ${Math.round(distanceKm)} km away (within ${LOCALITY_RADIUS_KM} km locality); mechanical inspection not required.`,
    };
  }
  const insp = hasRecentDetailedInspection(db, organizationId, vehicleId, referenceNow);
  return {
    required: true,
    distanceKm,
    inspectionOnFile: insp.exists,
    reason: insp.exists
      ? `Destination is ${Math.round(distanceKm)} km away (beyond ${LOCALITY_RADIUS_KM} km locality); a passing detailed mechanical inspection is on file (${insp.createdAt?.slice(0, 10) ?? "—"}).`
      : `Destination is ${Math.round(distanceKm)} km away (beyond ${LOCALITY_RADIUS_KM} km locality). A passing detailed mechanical inspection within the last ${MECHANICAL_INSPECTION_MAX_AGE_DAYS} days is required before this vehicle can be allocated, or a fleet-lead override with a written reason.`,
  };
}
