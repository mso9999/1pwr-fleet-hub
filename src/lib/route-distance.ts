/**
 * Multi-leg driving distance: OSRM when available, else haversine × 1.4.
 */

import { drivingDistanceKm, type LatLng } from "@/lib/routing-osrm";
import { ROAD_FALLBACK_FACTOR } from "@/lib/fuel-calculator";

export type RouteLegSource = "road" | "estimated";

export type RouteLegResult = {
  fromIndex: number;
  toIndex: number;
  from: LatLng;
  to: LatLng;
  distanceKm: number;
  source: RouteLegSource;
};

export type MultiLegRouteResult = {
  legs: RouteLegResult[];
  roadKm: number;
  estimatedKm: number;
  totalKm: number;
  /** Road line as [lat, lng] pairs. Empty when the router returned no geometry. */
  geometry: Array<[number, number]>;
};

/** Earth-radius haversine in km (same math as locality-gate). */
export function haversineKm(a: LatLng, b: LatLng): number {
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

export function estimatedRoadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROAD_FALLBACK_FACTOR * 10) / 10;
}

function almostSame(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** OSRM GeoJSON coordinates are [lng, lat]. Leaflet wants [lat, lng]. */
export function latLngsFromGeoJsonLine(geometry: unknown): Array<[number, number]> {
  if (!geometry || typeof geometry !== "object") return [];
  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords)) return [];
  const out: Array<[number, number]> = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([lat, lng]);
  }
  return out;
}

type OsrmRoute = { meters: number[]; geometry: Array<[number, number]> };

/**
 * OSRM multi-waypoint request. Returns per-leg metres and the road line, or null if the call fails.
 */
async function osrmRoute(points: LatLng[]): Promise<OsrmRoute | null> {
  if (points.length < 2) return { meters: [], geometry: [] };
  const path = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        legs?: Array<{ distance?: number }>;
        geometry?: { coordinates?: unknown };
      }>;
    };
    if (data.code && data.code !== "Ok") return null;
    const route = data.routes?.[0];
    const legs = route?.legs;
    if (!Array.isArray(legs) || legs.length !== points.length - 1) return null;
    const meters: number[] = [];
    for (const leg of legs) {
      const m = leg?.distance;
      if (typeof m !== "number" || !Number.isFinite(m)) return null;
      meters.push(m);
    }
    return { meters, geometry: latLngsFromGeoJsonLine(route?.geometry) };
  } catch {
    return null;
  }
}

async function resolveOneLeg(from: LatLng, to: LatLng): Promise<{ km: number; source: RouteLegSource }> {
  if (almostSame(from, to)) return { km: 0, source: "road" };
  const road = await drivingDistanceKm(from, to);
  if (road != null && Number.isFinite(road)) {
    return { km: road, source: "road" };
  }
  return { km: estimatedRoadKm(from, to), source: "estimated" };
}

/**
 * Sum driving distance along an ordered list of waypoints.
 * Failed OSRM legs use straight-line × {@link ROAD_FALLBACK_FACTOR}.
 */
export async function multiLegDrivingDistance(points: LatLng[]): Promise<MultiLegRouteResult> {
  if (points.length < 2) {
    return { legs: [], roadKm: 0, estimatedKm: 0, totalKm: 0, geometry: [] };
  }

  const legs: RouteLegResult[] = [];
  const bulk = await osrmRoute(points);
  let geometry: Array<[number, number]> = [];

  if (bulk) {
    geometry = bulk.geometry;
    for (let i = 0; i < bulk.meters.length; i += 1) {
      const meters = bulk.meters[i];
      const km = round1(meters / 1000);
      legs.push({
        fromIndex: i,
        toIndex: i + 1,
        from: points[i],
        to: points[i + 1],
        distanceKm: km,
        source: "road",
      });
    }
  } else {
    for (let i = 0; i < points.length - 1; i += 1) {
      const { km, source } = await resolveOneLeg(points[i], points[i + 1]);
      legs.push({
        fromIndex: i,
        toIndex: i + 1,
        from: points[i],
        to: points[i + 1],
        distanceKm: km,
        source,
      });
    }
  }

  let roadKm = 0;
  let estimatedKm = 0;
  for (const leg of legs) {
    if (leg.source === "road") roadKm += leg.distanceKm;
    else estimatedKm += leg.distanceKm;
  }
  return {
    legs,
    roadKm: round1(roadKm),
    estimatedKm: round1(estimatedKm),
    totalKm: round1(roadKm + estimatedKm),
    geometry,
  };
}

/**
 * Build the waypoint list for a trip.
 * Round-trip appends a return to the start when the path does not already close.
 */
export function buildTripWaypoints(
  points: LatLng[],
  tripShape: "one_way" | "round_trip" | "multi_stop"
): LatLng[] {
  const cleaned = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (cleaned.length === 0) return [];
  if (tripShape === "round_trip" && cleaned.length >= 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (!almostSame(first, last)) {
      return [...cleaned, first];
    }
  }
  return cleaned;
}
