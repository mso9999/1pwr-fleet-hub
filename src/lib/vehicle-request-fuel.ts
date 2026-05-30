import type Database from "better-sqlite3";
import { drivingDistanceKm, type LatLng } from "@/lib/routing-osrm";
import { litersForDistanceKm, suggestFuelLPer100km } from "@/lib/vehicle-fuel-lookup";

/**
 * Last-resort fallback coordinates for common Lesotho route sites.
 * These are only used when a site row exists but metadata lat/lng is missing.
 */
const LEGACY_SITE_COORDINATES: Record<string, LatLng> = {
  HQ: { lat: -29.3387, lng: 27.4618 },
  MAK: { lat: -29.1929, lng: 27.5681 },
  MAS: { lat: -29.3902, lng: 27.5603 },
  SEB: { lat: -30.2921, lng: 27.8153 },
  MAT: { lat: -29.6181, lng: 27.5653 },
  LEB: { lat: -30.1793, lng: 27.9874 },
  SEH: { lat: -29.908, lng: 29.1169 },
  QN: { lat: -29.9657, lng: 28.7381 },
  TY: { lat: -29.152, lng: 27.7428 },
  BFN: { lat: -29.1164, lng: 26.2155 },
  JHB: { lat: -26.205, lng: 28.0497 },
};

function parseMeta(meta: string | null | undefined): { lat?: number; lng?: number } {
  if (!meta || !meta.trim()) return {};
  try {
    const o = JSON.parse(meta) as {
      lat?: unknown;
      lng?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    const latRaw = o.lat ?? o.latitude;
    const lngRaw = o.lng ?? o.longitude;
    const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === "number" ? lngRaw : Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
    return { lat, lng };
  } catch {
    return {};
  }
}

/** Route start: org HQ coords, or first site code HQ with GPS, else Maseru area default. */
export function getRouteOrigin(db: Database.Database, organizationId: string): LatLng | null {
  const org = db
    .prepare(
      "SELECT route_origin_lat, route_origin_lng FROM organizations WHERE id = ?"
    )
    .get(organizationId) as
    | { route_origin_lat: number | null; route_origin_lng: number | null }
    | undefined;
  if (
    org &&
    typeof org.route_origin_lat === "number" &&
    typeof org.route_origin_lng === "number" &&
    Number.isFinite(org.route_origin_lat) &&
    Number.isFinite(org.route_origin_lng)
  ) {
    return { lat: org.route_origin_lat, lng: org.route_origin_lng };
  }

  const hq = db
    .prepare(
      `SELECT meta FROM reference_data
       WHERE organization_id = ? AND type = 'site' AND upper(code) = 'HQ' AND active = 1 LIMIT 1`
    )
    .get(organizationId) as { meta: string } | undefined;
  if (hq) {
    const { lat, lng } = parseMeta(hq.meta);
    if (lat !== undefined && lng !== undefined) return { lat, lng };
  }

  return { lat: -29.315, lng: 27.487 };
}

export function getSiteCoordsByCode(
  db: Database.Database,
  organizationId: string,
  siteCode: string
): LatLng | null {
  const normalizedCode = siteCode.trim().toUpperCase();
  const row = db
    .prepare(
      `SELECT meta FROM reference_data
       WHERE organization_id = ? AND type = 'site' AND code = ? AND active = 1 LIMIT 1`
    )
    .get(organizationId, siteCode) as { meta: string } | undefined;
  if (row) {
    const { lat, lng } = parseMeta(row.meta);
    if (lat !== undefined && lng !== undefined) return { lat, lng };
  }

  // HQ is the route origin by definition. If nobody has filled in GPS on the HQ site row,
  // use the organisation's route origin (populated by migrateOrganizationsRouteOrigin for
  // 1pwr_lesotho, admin-editable for other orgs). This unblocks HQ-destination estimates
  // that would otherwise surface "Could not resolve route" despite the origin being valid.
  if (normalizedCode === "HQ") {
    return getRouteOrigin(db, organizationId);
  }

  // Safety-net fallback for known static sites when metadata is absent.
  const legacy = LEGACY_SITE_COORDINATES[normalizedCode];
  if (legacy) return legacy;

  return null;
}

/**
 * Computes distance + optional fuel for a vehicle request. Updates row.
 * Destination must match a site code with meta lat/lng, or free-text (no distance).
 */
export async function recalculateVehicleRequestFuel(
  db: Database.Database,
  requestId: string
): Promise<void> {
  const vr = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(requestId) as
    | Record<string, unknown>
    | undefined;
  if (!vr) return;

  const orgId = String(vr.organization_id ?? "1pwr_lesotho");
  const destination = String(vr.destination ?? "").trim();
  if (!destination) {
    db.prepare(
      `UPDATE vehicle_requests SET estimated_route_km = NULL, estimated_fuel_liters = NULL,
       fuel_efficiency_l_per_100km = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(requestId);
    return;
  }

  const origin = getRouteOrigin(db, orgId);
  const dest = getSiteCoordsByCode(db, orgId, destination);
  if (!origin || !dest) {
    db.prepare(
      `UPDATE vehicle_requests SET estimated_route_km = NULL, estimated_fuel_liters = NULL,
       fuel_efficiency_l_per_100km = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(requestId);
    return;
  }

  const distanceKm = await drivingDistanceKm(origin, dest);
  if (distanceKm === null) {
    db.prepare(
      `UPDATE vehicle_requests SET estimated_route_km = NULL, estimated_fuel_liters = NULL,
       updated_at = datetime('now') WHERE id = ?`
    ).run(requestId);
    return;
  }

  const vid = vr.assigned_vehicle_id as string | null;
  let lPer100: number | null = null;
  if (vid) {
    const veh = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vid) as Record<string, unknown> | undefined;
    if (veh) {
      const manual = veh.fuel_consumption_l_per_100km as number | null | undefined;
      if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
        lPer100 = manual;
      } else {
        const sug = suggestFuelLPer100km(
          String(veh.make ?? ""),
          String(veh.model ?? ""),
          typeof veh.year === "number" ? veh.year : null
        );
        if (sug) lPer100 = sug.lPer100km;
      }
    }
  }

  const fuelLiters = lPer100 !== null ? litersForDistanceKm(distanceKm, lPer100) : null;

  db.prepare(
    `UPDATE vehicle_requests SET
      estimated_route_km = ?,
      estimated_fuel_liters = ?,
      fuel_efficiency_l_per_100km = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(distanceKm, fuelLiters, lPer100 ?? null, requestId);
}
