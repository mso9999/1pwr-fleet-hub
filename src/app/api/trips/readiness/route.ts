import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { evaluateTripReadiness, MISSION_PROFILE } from "@/lib/trip-readiness";

/**
 * GET /api/trips/readiness?org=&vehicleId=&missionProfile=local|field&checkDate=YYYY-MM-DD
 *
 * Returns gate status before checkout so the Trips UI can show what’s missing.
 */
export function GET(request: NextRequest): NextResponse {
  const sp = request.nextUrl.searchParams;
  const organizationId = sp.get("org") || "1pwr_lesotho";
  const vehicleId = sp.get("vehicleId");
  const missionProfile = sp.get("missionProfile") || MISSION_PROFILE.LOCAL;
  const checkDate = sp.get("checkDate") || undefined;

  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const db = getDb();
  const { ok, gates, missionProfile: profile } = evaluateTripReadiness(db, {
    organizationId,
    vehicleId,
    missionProfile,
    checkDate,
  });

  return NextResponse.json({ ok, missionProfile: profile, gates });
}
