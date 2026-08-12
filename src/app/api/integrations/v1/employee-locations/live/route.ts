import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/employee-locations/live
 * Returns the latest GPS position for each vehicle, joined with the current
 * trip/driver if active. HR uses this for the deployment map.
 * Auth: X-Fleet-Integration-Key.
 *
 * Query: org (default 1pwr_lesotho)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";

  const db = getDb();
  // Latest GPS per vehicle
  const locations = db.prepare(`
    SELECT g.vehicle_id as vehicleId, g.lat, g.lng, g.speed, g.mileage,
           g.source_ts as sourceTs, g.created_at as createdAt,
           v.code as vehicleCode, v.make, v.model, v.license_plate as licensePlate
    FROM vehicle_gps_snapshots g
    JOIN vehicles v ON v.id = g.vehicle_id
    WHERE g.id IN (
      SELECT MAX(id) FROM vehicle_gps_snapshots
      WHERE organization_id = ?
      GROUP BY vehicle_id
    )
    AND v.organization_id = ?
  `).all(org, org);

  return NextResponse.json({ count: locations.length, locations });
}
