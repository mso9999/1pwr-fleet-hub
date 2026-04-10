import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/analytics/performance?groupBy=make|model|fuel_type|transmission|year|asset_class
 *
 * Fleet performance ranking — compares cohorts by uptime, cost/km, WO frequency, repair cost.
 */
export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const groupBy = sp.get("groupBy") || "make";

  const validGroups = ["make", "model", "fuel_type", "transmission", "year", "asset_class"];
  const groupCol = validGroups.includes(groupBy) ? `v.${groupBy}` : "v.make";

  const rows = db.prepare(`
    SELECT
      ${groupCol} as cohort,
      COUNT(DISTINCT v.id) as vehicle_count,
      COALESCE(AVG(v.total_mileage_km), 0) as avg_mileage,
      COALESCE(SUM(wo.total_cost), 0) as total_repair_cost,
      COUNT(wo.id) as total_wo_count,
      COALESCE(SUM(
        CASE WHEN wo.downtime_end IS NOT NULL 
          THEN julianday(wo.downtime_end) - julianday(wo.downtime_start)
          ELSE 0
        END
      ), 0) as total_downtime_days_completed,
      COALESCE(AVG(v.purchase_price), 0) as avg_purchase_price,
      COALESCE(AVG(
        CASE WHEN v.total_mileage_km > 0 THEN
          (v.purchase_price + COALESCE(wo_agg.vehicle_repair_cost, 0)) / v.total_mileage_km
        ELSE NULL END
      ), 0) as avg_cost_per_km
    FROM vehicles v
    LEFT JOIN work_orders wo ON wo.vehicle_id = v.id
    LEFT JOIN (
      SELECT vehicle_id, SUM(total_cost) as vehicle_repair_cost
      FROM work_orders GROUP BY vehicle_id
    ) wo_agg ON wo_agg.vehicle_id = v.id
    WHERE v.organization_id = ? AND ${groupCol} IS NOT NULL AND ${groupCol} != ''
    GROUP BY ${groupCol}
    HAVING vehicle_count >= 1
    ORDER BY total_repair_cost / NULLIF(COUNT(DISTINCT v.id), 0) ASC
  `).all(org) as Array<Record<string, unknown>>;

  const results = rows.map((r) => {
    const vehicleCount = (r.vehicle_count as number) || 1;
    const totalRepairCost = (r.total_repair_cost as number) || 0;
    const totalWoCount = (r.total_wo_count as number) || 0;
    const totalDowntime = (r.total_downtime_days_completed as number) || 0;

    return {
      cohort: r.cohort || "Unknown",
      vehicleCount,
      avgMileageKm: Math.round((r.avg_mileage as number) || 0),
      avgPurchasePrice: Math.round((r.avg_purchase_price as number) || 0),
      totalRepairCost: Math.round(totalRepairCost),
      avgRepairCostPerVehicle: Math.round(totalRepairCost / vehicleCount),
      totalWorkOrders: totalWoCount,
      avgWorkOrdersPerVehicle: Math.round((totalWoCount / vehicleCount) * 10) / 10,
      totalDowntimeDays: Math.round(totalDowntime),
      avgDowntimeDaysPerVehicle: Math.round((totalDowntime / vehicleCount) * 10) / 10,
      avgCostPerKm: Math.round((r.avg_cost_per_km as number) * 100) / 100,
    };
  });

  return NextResponse.json({
    groupBy,
    cohorts: results,
  });
}
