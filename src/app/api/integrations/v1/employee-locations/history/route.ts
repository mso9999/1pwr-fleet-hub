import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/employee-locations/history
 * Returns GPS history for a vehicle or all vehicles in a time range.
 * Auth: X-Fleet-Integration-Key.
 *
 * Query: org, vehicle_id (optional), from (epoch seconds), to (epoch seconds), limit (default 500, max 5000)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const vehicleId = searchParams.get("vehicle_id");
  const fromTs = parseInt(searchParams.get("from") || "0");
  const toTs = parseInt(searchParams.get("to") || String(Math.floor(Date.now() / 1000)));
  const limit = Math.min(parseInt(searchParams.get("limit") || "500"), 5000);

  const db = getDb();
  let query = `SELECT g.vehicle_id as vehicleId, g.lat, g.lng, g.speed, g.mileage,
    g.source_ts as sourceTs, g.created_at as createdAt,
    v.code as vehicleCode
    FROM vehicle_gps_snapshots g
    JOIN vehicles v ON v.id = g.vehicle_id
    WHERE g.organization_id = ? AND g.source_ts >= ? AND g.source_ts <= ?`;
  const params: (string | number)[] = [org, fromTs, toTs];

  if (vehicleId) { query += " AND g.vehicle_id = ?"; params.push(vehicleId); }
  query += " ORDER BY g.source_ts DESC LIMIT ?";
  params.push(limit);

  const history = db.prepare(query).all(...params);
  return NextResponse.json({ count: history.length, history });
}
