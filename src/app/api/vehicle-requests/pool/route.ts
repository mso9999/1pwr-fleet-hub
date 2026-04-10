import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/vehicle-requests/pool
 *
 * Returns the operational vehicle pool grouped by pool category,
 * with upcoming request conflicts for capacity planning.
 */
export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";

  const vehicles = db.prepare(`
    SELECT id, code, make, model, year, asset_class, status, pool, assigned_team, current_location
    FROM vehicles
    WHERE organization_id = ? AND status = 'operational'
    ORDER BY pool, code
  `).all(org) as Array<Record<string, unknown>>;

  const pendingRequests = db.prepare(`
    SELECT vr.id, vr.departure_date, vr.return_date, vr.destination, vr.requested_by_name,
           vr.required_vehicle_class, vr.priority, vr.status, vr.assigned_vehicle_id,
           av.code as assigned_vehicle_code
    FROM vehicle_requests vr
    LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
    WHERE vr.organization_id = ? AND vr.status IN ('requested', 'approved', 'assigned')
    ORDER BY vr.departure_date ASC
  `).all(org);

  const pools: Record<string, typeof vehicles> = {};
  for (const v of vehicles) {
    const pool = (v.pool as string) || "general";
    if (!pools[pool]) pools[pool] = [];
    pools[pool].push(v);
  }

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM vehicles WHERE organization_id = ? GROUP BY status
  `).all(org) as Array<{ status: string; count: number }>;

  return NextResponse.json({
    pools,
    availableCount: vehicles.length,
    statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r.count])),
    pendingRequests,
  });
}
