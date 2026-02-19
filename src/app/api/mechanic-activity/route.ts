import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const period = searchParams.get("period") || "daily";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const mechanic = searchParams.get("mechanic");

  const today = new Date().toISOString().slice(0, 10);

  let periodStart = from || today;
  let periodEnd = to || today;

  if (!from && !to) {
    const d = new Date();
    if (period === "weekly") {
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((day + 6) % 7));
      periodStart = mon.toISOString().slice(0, 10);
      periodEnd = today;
    } else if (period === "monthly") {
      periodStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      periodEnd = today;
    }
  }

  const params: unknown[] = [org, periodStart, periodEnd];
  let mechanicFilter = "";
  if (mechanic) {
    mechanicFilter = " AND l.worker_name = ?";
    params.push(mechanic);
  }

  // Per-mechanic summary
  const summaryRows = db.prepare(`
    SELECT 
      l.worker_name,
      COUNT(DISTINCT l.work_order_id) as work_orders_touched,
      COUNT(DISTINCT wo.vehicle_id) as vehicles_touched,
      SUM(l.hours) as total_hours,
      SUM(l.hours * l.rate_per_hour) as total_cost,
      COUNT(*) as labor_entries,
      MIN(l.work_date) as first_date,
      MAX(l.work_date) as last_date
    FROM work_order_labor l
    JOIN work_orders wo ON l.work_order_id = wo.id
    WHERE wo.organization_id = ?
      AND l.work_date >= ? AND l.work_date <= ?
      ${mechanicFilter}
    GROUP BY l.worker_name
    ORDER BY total_hours DESC
  `).all(...params) as Array<{
    worker_name: string;
    work_orders_touched: number;
    vehicles_touched: number;
    total_hours: number;
    total_cost: number;
    labor_entries: number;
    first_date: string;
    last_date: string;
  }>;

  // Detailed entries per mechanic with vehicle and work order info
  const detailRows = db.prepare(`
    SELECT
      l.id,
      l.worker_name,
      l.work_date,
      l.hours,
      l.rate_per_hour,
      l.description,
      l.role,
      wo.id as work_order_id,
      wo.title as work_order_title,
      wo.status as work_order_status,
      v.id as vehicle_id,
      v.code as vehicle_code,
      v.make as vehicle_make,
      v.model as vehicle_model
    FROM work_order_labor l
    JOIN work_orders wo ON l.work_order_id = wo.id
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ?
      AND l.work_date >= ? AND l.work_date <= ?
      ${mechanicFilter}
    ORDER BY l.work_date DESC, l.worker_name ASC
  `).all(...params);

  // Daily breakdown per mechanic
  const dailyParams: unknown[] = [org, periodStart, periodEnd];
  if (mechanic) dailyParams.push(mechanic);

  const dailyBreakdown = db.prepare(`
    SELECT
      l.work_date,
      l.worker_name,
      SUM(l.hours) as hours,
      COUNT(DISTINCT wo.vehicle_id) as vehicles,
      COUNT(DISTINCT l.work_order_id) as work_orders,
      GROUP_CONCAT(DISTINCT v.code) as vehicle_codes
    FROM work_order_labor l
    JOIN work_orders wo ON l.work_order_id = wo.id
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ?
      AND l.work_date >= ? AND l.work_date <= ?
      ${mechanicFilter}
    GROUP BY l.work_date, l.worker_name
    ORDER BY l.work_date DESC, l.worker_name ASC
  `).all(...dailyParams);

  // Unique mechanics list for filter dropdown
  const mechanics = db.prepare(`
    SELECT DISTINCT l.worker_name
    FROM work_order_labor l
    JOIN work_orders wo ON l.work_order_id = wo.id
    WHERE wo.organization_id = ?
    ORDER BY l.worker_name ASC
  `).all(org) as Array<{ worker_name: string }>;

  return NextResponse.json({
    period,
    periodStart,
    periodEnd,
    mechanics: mechanics.map((m) => m.worker_name),
    summary: summaryRows,
    dailyBreakdown,
    detail: detailRows,
  });
}
