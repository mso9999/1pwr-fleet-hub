import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listEligibleDepartureTrips } from "@/lib/eligible-for-departure";

/**
 * GET /api/trips/eligible-for-departure?vehicleId=X&org=Y
 *
 * Source of truth for the departing driver-vehicle-check "Mission / Trip"
 * picker. Returns open trips and approved missions reserved for this vehicle
 * (including planned trips still on the UNALLOCATED sentinel, and approved
 * missions that do not yet have a trip record).
 *
 * If the list is empty, `emptyHint` explains the usual dispatch follow-up
 * (no vehicle reserved yet vs reserved for a different unit).
 */
export function GET(request: NextRequest): NextResponse {
  try {
    const sp = request.nextUrl.searchParams;
    const vehicleId = (sp.get("vehicleId") || "").trim();
    const org = (sp.get("org") || "1pwr_lesotho").trim();

    if (!vehicleId) {
      return NextResponse.json(
        { error: "vehicleId is required", trips: [], emptyHint: null },
        { status: 400 }
      );
    }

    const db = getDb();
    const result = listEligibleDepartureTrips(db, {
      organizationId: org,
      vehicleId,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[trips/eligible-for-departure] GET error:", err);
    return NextResponse.json(
      { error: String(err), trips: [], emptyHint: null },
      { status: 500 }
    );
  }
}
