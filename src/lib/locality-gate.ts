import type Database from "better-sqlite3";
import { getSiteCoordsByCode, getRouteOrigin } from "@/lib/vehicle-request-fuel";

/** Outside-HQ-radius allocations require a passing inspection after the latest deployment. */
export const LOCALITY_RADIUS_KM = 50;
export const MECHANICAL_INSPECTION_TYPES = ["detailed"] as const;

interface LatLng {
  lat: number;
  lng: number;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function distanceHqToDestination(
  db: Database.Database,
  organizationId: string,
  destinationCode: string
): number | null {
  const origin = getRouteOrigin(db, organizationId);
  const destination = getSiteCoordsByCode(db, organizationId, destinationCode);
  if (!origin || !destination) return null;
  return haversineKm(origin, destination);
}

export function hasPostDeploymentDetailedInspection(
  db: Database.Database,
  organizationId: string,
  vehicleId: string
): {
  exists: boolean;
  inspectionId: string | null;
  inspectionCreatedAt: string | null;
  lastDeploymentAt: string | null;
} {
  const last = db.prepare(
    `SELECT MAX(COALESCE(NULLIF(departed_at, ''), checkout_at)) AS deployed_at
     FROM trips
     WHERE organization_id = ? AND vehicle_id = ?
       AND (NULLIF(departed_at, '') IS NOT NULL OR checkin_at IS NOT NULL)`
  ).get(organizationId, vehicleId) as { deployed_at: string | null } | undefined;
  const lastDeploymentAt = last?.deployed_at || null;
  const placeholders = MECHANICAL_INSPECTION_TYPES.map(() => "?").join(", ");
  const inspection = db.prepare(
    `SELECT id, created_at FROM inspections
     WHERE organization_id = ? AND vehicle_id = ? AND overall_pass = 1
       AND type IN (${placeholders})
       AND (? IS NULL OR datetime(created_at) > datetime(?))
     ORDER BY datetime(created_at) DESC LIMIT 1`
  ).get(
    organizationId,
    vehicleId,
    ...MECHANICAL_INSPECTION_TYPES,
    lastDeploymentAt,
    lastDeploymentAt
  ) as { id: string; created_at: string } | undefined;

  return {
    exists: !!inspection,
    inspectionId: inspection?.id ?? null,
    inspectionCreatedAt: inspection?.created_at ?? null,
    lastDeploymentAt,
  };
}

export interface LocalityGateResult {
  required: boolean;
  distanceKm: number | null;
  inspectionOnFile: boolean;
  lastDeploymentAt: string | null;
  inspectionCreatedAt: string | null;
  reason: string;
}

export function localityGateRequired(
  db: Database.Database,
  organizationId: string,
  vehicleId: string,
  destinationCode: string
): LocalityGateResult {
  const distanceKm = distanceHqToDestination(db, organizationId, destinationCode);
  if (distanceKm === null) {
    return {
      required: false,
      distanceKm: null,
      inspectionOnFile: false,
      lastDeploymentAt: null,
      inspectionCreatedAt: null,
      reason: "Distance from HQ to destination could not be computed; locality gate skipped.",
    };
  }
  if (distanceKm <= LOCALITY_RADIUS_KM) {
    return {
      required: false,
      distanceKm,
      inspectionOnFile: false,
      lastDeploymentAt: null,
      inspectionCreatedAt: null,
      reason: `Destination is ${Math.round(distanceKm)} km from HQ (within ${LOCALITY_RADIUS_KM} km); post-deployment mechanical inspection not required.`,
    };
  }

  const inspection = hasPostDeploymentDetailedInspection(db, organizationId, vehicleId);
  const recency = inspection.lastDeploymentAt
    ? `after the last deployment (${inspection.lastDeploymentAt.slice(0, 10)})`
    : "before the vehicle's first recorded deployment";
  return {
    required: true,
    distanceKm,
    inspectionOnFile: inspection.exists,
    lastDeploymentAt: inspection.lastDeploymentAt,
    inspectionCreatedAt: inspection.inspectionCreatedAt,
    reason: inspection.exists
      ? `Destination is ${Math.round(distanceKm)} km from HQ. A passing detailed mechanical inspection is on file (${inspection.inspectionCreatedAt?.slice(0, 10) ?? "—"}), ${recency}.`
      : `Destination is ${Math.round(distanceKm)} km from HQ (outside ${LOCALITY_RADIUS_KM} km). A passing detailed mechanical inspection ${recency} is required before this vehicle can be allocated, or a fleet-lead override with a written reason.`,
  };
}
