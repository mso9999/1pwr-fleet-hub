import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureTutorialDemoVehicle, seedTutorialSandboxMission } from "@/lib/tutorial-sandbox";

/**
 * Tutorial demo data:
 * - Default: one vehicle (code TUT-…) for the full-app tour and other tracks.
 * - `trackId: "fieldDeployment"`: also ensures an approved sandbox mission + active reservation on that vehicle (idempotent per org).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    trackId?: string;
  };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const db = getDb();

  if (body.trackId === "fieldDeployment") {
    try {
      const r = seedTutorialSandboxMission(db, organizationId);
      return NextResponse.json({
        mode: "fieldDeployment",
        missionId: r.missionId,
        vehicleId: r.vehicleId,
        vehicleCode: r.vehicleCode,
        reservationId: r.reservationId,
        sandboxMissionAlreadyExisted: r.alreadyExisted,
      });
    } catch (e) {
      console.error("[tutorial/seed] fieldDeployment", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Sandbox seed failed" },
        { status: 500 }
      );
    }
  }

  const v = ensureTutorialDemoVehicle(db, organizationId);
  return NextResponse.json({
    vehicleId: v.id,
    code: v.code,
    alreadyExists: !v.created,
  });
}
