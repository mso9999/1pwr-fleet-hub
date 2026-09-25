import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { estimateFuelBudget } from "@/lib/fuel-estimate";
import { lPer100ToKmPerL } from "@/lib/fuel-calculator";

/**
 * POST /api/fuel-calculator/estimate
 * Multi-leg OSRM (+ 1.4 straight-line fallback) and Excel fuel budget.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const organizationId = String(body.organizationId || "1pwr_lesotho");
  const tripShapeRaw = String(body.tripShape || "one_way").toLowerCase();
  const tripShape =
    tripShapeRaw === "round_trip" || tripShapeRaw === "multi_stop" ? tripShapeRaw : "one_way";

  const waypoints = Array.isArray(body.waypoints)
    ? (body.waypoints as Array<Record<string, unknown>>).map((w) => ({
        label: w.label != null ? String(w.label) : undefined,
        siteCode: w.siteCode != null ? String(w.siteCode) : undefined,
        lat: typeof w.lat === "number" ? w.lat : w.lat != null ? Number(w.lat) : null,
        lng: typeof w.lng === "number" ? w.lng : w.lng != null ? Number(w.lng) : null,
      }))
    : undefined;

  let kmPerLitre: number | null =
    typeof body.kmPerLitre === "number"
      ? body.kmPerLitre
      : body.kmPerLitre != null
        ? Number(body.kmPerLitre)
        : null;
  const lPer100 =
    typeof body.lPer100km === "number"
      ? body.lPer100km
      : body.lPer100km != null
        ? Number(body.lPer100km)
        : null;
  if (!(kmPerLitre && kmPerLitre > 0) && lPer100 && lPer100 > 0) {
    kmPerLitre = lPer100ToKmPerL(lPer100);
  }

  const db = getDb();
  const result = await estimateFuelBudget(db, {
    organizationId,
    tripShape,
    waypoints,
    origin: body.origin
      ? {
          label: String((body.origin as { label?: string }).label || "HQ"),
          siteCode: String((body.origin as { siteCode?: string }).siteCode || "HQ"),
          lat: (body.origin as { lat?: number }).lat ?? null,
          lng: (body.origin as { lng?: number }).lng ?? null,
        }
      : undefined,
    destination: body.destination
      ? {
          label: String((body.destination as { label?: string }).label || ""),
          siteCode: String(
            (body.destination as { siteCode?: string }).siteCode ||
              (body.destination as { label?: string }).label ||
              ""
          ),
          lat: (body.destination as { lat?: number }).lat ?? null,
          lng: (body.destination as { lng?: number }).lng ?? null,
        }
      : undefined,
    vehicleId: body.vehicleId ? String(body.vehicleId) : null,
    kmPerLitre,
    lPer100km: lPer100,
    pumpPricePerLitre:
      typeof body.pumpPricePerLitre === "number"
        ? body.pumpPricePerLitre
        : body.pumpPricePerLitre != null
          ? Number(body.pumpPricePerLitre)
          : null,
    safetyFactor:
      typeof body.safetyFactor === "number"
        ? body.safetyFactor
        : body.safetyFactor != null
          ? Number(body.safetyFactor)
          : null,
    currency: body.currency != null ? String(body.currency) : null,
  });

  return NextResponse.json(result);
}
