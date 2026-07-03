import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { evaluateReadinessForMissionLinkedTrip } from "@/lib/mission-deployment-readiness";

/**
 * GET /api/trips/readiness?org=&vehicleId=&missionId=&checkDate=YYYY-MM-DD
 * Mission-linked checkout only: gates are operational vehicle + driver checklist (local missions skip DVC).
 */
export function GET(request: NextRequest): NextResponse {
  const sp = request.nextUrl.searchParams;
  const organizationId = sp.get("org") || "1pwr_lesotho";
  const vehicleId = sp.get("vehicleId");
  const missionId = sp.get("missionId");
  const checkDate = sp.get("checkDate") || undefined;

  if (!missionId) {
    return NextResponse.json({ error: "missionId is required" }, { status: 400 });
  }

  const db = getDb();
  const r = evaluateReadinessForMissionLinkedTrip(db, {
    organizationId,
    missionId,
    vehicleId: vehicleId || "",
    checkDate,
  });

  return NextResponse.json({
    ok: r.ok,
    missionProfile: r.missionProfile,
    gates: r.gates,
    missionBlockedReason: r.missionBlockedReason,
  });
}
