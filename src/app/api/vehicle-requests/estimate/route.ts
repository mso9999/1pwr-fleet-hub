import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getRouteOrigin, getSiteCoordsByCode } from "@/lib/vehicle-request-fuel";
import { drivingDistanceKm } from "@/lib/routing-osrm";
import { litersForDistanceKm, suggestFuelLPer100km } from "@/lib/vehicle-fuel-lookup";

/**
 * POST /api/vehicle-requests/estimate
 * Body: { organizationId, destinationSiteCode?, vehicleId? }
 * Preview distance (OSRM) and optional fuel when vehicle known.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const organizationId = body.organizationId || "1pwr_lesotho";
  const siteCode = String(body.destinationSiteCode || "").trim();
  const vehicleId = body.vehicleId ? String(body.vehicleId) : null;

  if (!siteCode) {
    return NextResponse.json({ error: "destinationSiteCode required" }, { status: 400 });
  }

  const db = getDb();
  const origin = getRouteOrigin(db, organizationId);
  const dest = getSiteCoordsByCode(db, organizationId, siteCode);
  if (!origin) {
    return NextResponse.json({
      ok: false,
      message:
        "Could not resolve route: fleet HQ coordinates are not set for this organisation. Admins can set them in Admin.",
      distanceKm: null,
      fuelLiters: null,
      lPer100km: null,
    });
  }
  if (!dest) {
    return NextResponse.json({
      ok: false,
      message:
        `Could not resolve route: set GPS on site '${siteCode}' in Admin (Sites) so the distance can be estimated.`,
      distanceKm: null,
      fuelLiters: null,
      lPer100km: null,
    });
  }

  // HQ → HQ (or any zero-length route) should resolve locally; skip the OSRM hop.
  const sameOriginAsDest =
    Math.abs(origin.lat - dest.lat) < 1e-6 && Math.abs(origin.lng - dest.lng) < 1e-6;
  const distanceKm = sameOriginAsDest ? 0 : await drivingDistanceKm(origin, dest);
  if (distanceKm === null) {
    return NextResponse.json({
      ok: false,
      message: "Routing service unavailable. Try again later.",
      distanceKm: null,
      fuelLiters: null,
      lPer100km: null,
    });
  }

  let lPer100: number | null = null;
  if (vehicleId) {
    const veh = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as Record<string, unknown> | undefined;
    if (veh) {
      const manual = veh.fuel_consumption_l_per_100km as number | undefined;
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

  return NextResponse.json({
    ok: true,
    distanceKm,
    fuelLiters,
    lPer100km: lPer100,
    message:
      vehicleId && fuelLiters !== null
        ? null
        : "Fuel estimate applies after a vehicle is assigned (uses its make/model or manual L/100 km).",
  });
}
