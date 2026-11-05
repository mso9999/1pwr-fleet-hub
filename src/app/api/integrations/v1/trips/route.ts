import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/trips
 * Export FM trip data for HR (deployment tracking) and AM (loadout linkage).
 * Auth: X-Fleet-Integration-Key matching FLEET_INTEGRATION_API_KEY.
 *
 * Query: org (default 1pwr_lesotho), vehicle_id, from (ISO date), to (ISO date),
 * limit (default 200, max 1000), open=1 (only trips not checked back in).
 * vehicleCode and missionTitle are added for a fuel top-up, which links the
 * trip a vehicle is already on.
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
  const openOnly = searchParams.get("open") === "1";
  const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 1000);

  const db = getDb();
  let query = `SELECT t.id, t.organization_id as organizationId, t.vehicle_id as vehicleId,
    t.driver_id as driverId, t.driver_name as driverName, t.odo_start as odoStart, t.odo_end as odoEnd,
    t.departure_location as departureLocation, t.destination, t.arrival_location as arrivalLocation,
    t.mission_type as missionType, t.checkout_at as checkoutAt, t.checkin_at as checkinAt,
    t.distance, t.source, t.departed_at as departedAt, t.mission_id as missionId,
    t.mission_priority as missionPriority, t.approval_status as approvalStatus, t.trip_shape as tripShape,
    COALESCE(v.code, '') as vehicleCode,
    COALESCE(m.title, '') as missionTitle
    FROM trips t
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN missions m ON m.id = t.mission_id
    WHERE t.organization_id = ?`;
  const params: (string | number)[] = [org];

  if (vehicleId) { query += " AND t.vehicle_id = ?"; params.push(vehicleId); }
  if (from) { query += " AND t.checkout_at >= ?"; params.push(from); }
  if (to) { query += " AND t.checkout_at <= ?"; params.push(to); }
  if (openOnly) { query += " AND (t.checkin_at IS NULL OR t.checkin_at = '')"; }
  query += " ORDER BY t.checkout_at DESC LIMIT ?";
  params.push(limit);

  const trips = db.prepare(query).all(...params);
  return NextResponse.json({ count: trips.length, trips });
}
