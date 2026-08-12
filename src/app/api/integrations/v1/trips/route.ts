import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/trips
 * Export FM trip data for HR (deployment tracking) and AM (loadout linkage).
 * Auth: X-Fleet-Integration-Key matching FLEET_INTEGRATION_API_KEY.
 *
 * Query: org (default 1pwr_lesotho), vehicle_id, from (ISO date), to (ISO date), limit (default 200, max 1000)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const vehicleId = searchParams.get("vehicle_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 1000);

  const db = getDb();
  let query = `SELECT id, organization_id as organizationId, vehicle_id as vehicleId,
    driver_id as driverId, driver_name as driverName, odo_start as odoStart, odo_end as odoEnd,
    departure_location as departureLocation, destination, arrival_location as arrivalLocation,
    mission_type as missionType, checkout_at as checkoutAt, checkin_at as checkinAt,
    distance, source, departed_at as departedAt, mission_id as missionId,
    mission_priority as missionPriority, approval_status as approvalStatus, trip_shape as tripShape
    FROM trips WHERE organization_id = ?`;
  const params: (string | number)[] = [org];

  if (vehicleId) { query += " AND vehicle_id = ?"; params.push(vehicleId); }
  if (from) { query += " AND checkout_at >= ?"; params.push(from); }
  if (to) { query += " AND checkout_at <= ?"; params.push(to); }
  query += " ORDER BY checkout_at DESC LIMIT ?";
  params.push(limit);

  const trips = db.prepare(query).all(...params);
  return NextResponse.json({ count: trips.length, trips });
}
