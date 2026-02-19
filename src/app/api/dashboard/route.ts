import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM vehicles WHERE organization_id = ? GROUP BY status
  `).all(org) as { status: string; count: number }[];

  const stats: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    stats[row.status] = row.count;
    total += row.count;
  }

  const openWorkOrders = db.prepare(`
    SELECT COUNT(*) as count FROM work_orders WHERE organization_id = ? AND status NOT IN ('completed', 'validated')
  `).get(org) as { count: number };

  const avgRepair = db.prepare(`
    SELECT AVG(julianday(downtime_end) - julianday(downtime_start)) as avg_days
    FROM work_orders WHERE organization_id = ? AND downtime_end IS NOT NULL
  `).get(org) as { avg_days: number | null };

  const activeTrips = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.organization_id = ? AND t.checkin_at IS NULL ORDER BY t.checkout_at DESC
  `).all(org);

  const recentWorkOrders = db.prepare(`
    SELECT wo.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ? AND wo.status NOT IN ('completed', 'validated')
    ORDER BY CASE wo.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, wo.created_at DESC
    LIMIT 20
  `).all(org);

  return NextResponse.json({
    totalVehicles: total,
    operational: stats["operational"] || 0,
    deployed: stats["deployed"] || 0,
    maintenanceHq: stats["maintenance-hq"] || 0,
    maintenance3rd: stats["maintenance-3rdparty"] || 0,
    awaitingParts: stats["awaiting-parts"] || 0,
    grounded: stats["grounded"] || 0,
    writtenOff: stats["written-off"] || 0,
    openWorkOrders: openWorkOrders.count,
    avgRepairDays: avgRepair.avg_days ? Math.round(avgRepair.avg_days * 10) / 10 : 0,
    activeTrips,
    recentWorkOrders,
  });
}
