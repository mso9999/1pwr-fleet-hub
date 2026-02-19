import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";

  const tco = db.prepare(`
    SELECT 
      v.id as vehicle_id,
      v.code as vehicle_code,
      v.make as vehicle_make,
      v.model as vehicle_model,
      COALESCE(SUM(wo.parts_cost), 0) as parts_cost,
      COALESCE(SUM(wo.labour_cost), 0) as labour_cost,
      COALESCE(SUM(wo.third_party_cost), 0) as third_party_cost,
      COALESCE(SUM(wo.total_cost), 0) as total_cost,
      COUNT(wo.id) as work_order_count,
      COALESCE(SUM(
        CASE WHEN wo.downtime_end IS NOT NULL 
          THEN CAST((julianday(wo.downtime_end) - julianday(wo.downtime_start)) AS INTEGER)
          ELSE CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER)
        END
      ), 0) as total_downtime_days,
      CASE WHEN COUNT(wo.id) > 0 THEN
        COALESCE(SUM(
          CASE WHEN wo.downtime_end IS NOT NULL 
            THEN CAST((julianday(wo.downtime_end) - julianday(wo.downtime_start)) AS INTEGER)
            ELSE CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER)
          END
        ), 0) * 1.0 / COUNT(wo.id)
      ELSE 0 END as avg_repair_days
    FROM vehicles v
    LEFT JOIN work_orders wo ON wo.vehicle_id = v.id
    WHERE v.organization_id = ?
    GROUP BY v.id
    ORDER BY total_cost DESC
  `).all(org) as Array<{
    vehicle_id: string;
    vehicle_code: string;
    vehicle_make: string;
    vehicle_model: string;
    parts_cost: number;
    labour_cost: number;
    third_party_cost: number;
    total_cost: number;
    work_order_count: number;
    total_downtime_days: number;
    avg_repair_days: number;
  }>;

  return NextResponse.json(tco);
}
