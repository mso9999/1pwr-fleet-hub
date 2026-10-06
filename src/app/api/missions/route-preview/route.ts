import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { getSiteCoordsByCode } from "@/lib/vehicle-request-fuel";
import { buildTripWaypoints, multiLegDrivingDistance } from "@/lib/route-distance";
import type { LatLng } from "@/lib/routing-osrm";

export const runtime = "nodejs";

type InPoint = {
  label?: string;
  siteCode?: string;
  lat?: number | null;
  lng?: number | null;
};

type Place = {
  label: string;
  lat: number | null;
  lng: number | null;
  resolved: boolean;
};

function finitePair(lat: unknown, lng: unknown): LatLng | null {
  const la = typeof lat === "number" ? lat : NaN;
  const ln = typeof lng === "number" ? lng : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

/**
 * POST /api/missions/route-preview
 * Resolves site codes to coordinates and returns the driving line for the map.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    tripShape?: string;
    points?: InPoint[];
  };
  const organizationId = String(body.organizationId || "1pwr_lesotho");
  const shapeRaw = String(body.tripShape || "one_way");
  const tripShape =
    shapeRaw === "round_trip" || shapeRaw === "multi_stop" ? shapeRaw : "one_way";
  const incoming = Array.isArray(body.points) ? body.points : [];
  const db = getDb();

  const places: Place[] = [];
  const unresolved: string[] = [];
  const resolved: LatLng[] = [];

  for (const p of incoming) {
    const label = String(p?.label || p?.siteCode || "").trim();
    const siteCode = String(p?.siteCode || p?.label || "").trim();
    const direct = finitePair(p?.lat, p?.lng);
    const fromSite = !direct && siteCode ? getSiteCoordsByCode(db, organizationId, siteCode) : null;
    const coords = direct || fromSite;
    if (!label && !coords) continue;
    if (coords) {
      places.push({ label: label || siteCode, lat: coords.lat, lng: coords.lng, resolved: true });
      resolved.push(coords);
    } else {
      const name = label || siteCode;
      places.push({ label: name, lat: null, lng: null, resolved: false });
      unresolved.push(name);
    }
  }

  const path = buildTripWaypoints(resolved, tripShape);
  const route = path.length >= 2 ? await multiLegDrivingDistance(path) : null;

  return NextResponse.json({
    ok: unresolved.length === 0 && (route?.totalKm ?? 0) > 0,
    totalKm: route?.totalKm ?? null,
    geometry: route?.geometry ?? [],
    places,
    unresolved,
    message:
      unresolved.length > 0
        ? `No GPS for ${unresolved.join(", ")}. Set coordinates on the site, or drop a pin on the map.`
        : null,
  });
}
