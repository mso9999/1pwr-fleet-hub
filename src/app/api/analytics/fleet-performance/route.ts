import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  asDay,
  chooseRepairAmount,
  mileageFromInspectionItems,
  type FleetSourceData,
  type OdoPoint,
  type SpendEvent,
} from "@/lib/fleet-performance";

/**
 * GET /api/analytics/fleet-performance
 * Raw readings and repair spend for the performance charts. Monotonic filtering
 * happens in buildFleetPerformance so a date range can be applied in the browser.
 */
export function GET(): NextResponse {
  const db = getDb();
  const asOf = (db.prepare("SELECT date('now') as d").get() as { d: string }).d;

  const organizations = db
    .prepare("SELECT id, name, country, currency FROM organizations ORDER BY name")
    .all() as FleetSourceData["organizations"];

  const vehicles = db
    .prepare(
      `SELECT v.id, v.code, v.year, v.purchase_price, v.purchase_date, v.status,
              o.country, o.currency,
              (SELECT COUNT(*) FROM work_orders wo WHERE wo.vehicle_id = v.id) as wo_count,
              (SELECT COUNT(*) FROM work_orders wo WHERE wo.vehicle_id = v.id AND (
                 COALESCE(wo.total_cost,0) > 0
                 OR COALESCE(wo.parts_cost,0)+COALESCE(wo.labour_cost,0)+COALESCE(wo.third_party_cost,0) > 0
                 OR EXISTS (SELECT 1 FROM pr_cost_cache p WHERE p.work_order_id = wo.id AND COALESCE(p.approved_amount,0) > 0)
                 OR EXISTS (SELECT 1 FROM work_order_po_links l WHERE l.work_order_id = wo.id AND COALESCE(l.amount,0) > 0)
                 OR EXISTS (SELECT 1 FROM parts pt WHERE pt.work_order_id = wo.id AND COALESCE(pt.quantity,0)*COALESCE(pt.unit_cost,0) > 0)
                 OR EXISTS (SELECT 1 FROM work_order_labor lb WHERE lb.work_order_id = wo.id AND COALESCE(lb.hours,0)*COALESCE(lb.rate_per_hour,0) > 0)
              )) as wo_with_cost
       FROM vehicles v
       JOIN organizations o ON o.id = v.organization_id
       WHERE COALESCE(v.is_synthetic, 0) = 0
       ORDER BY o.country, v.code`
    )
    .all() as Array<{
      id: string;
      code: string;
      year: number | null;
      purchase_price: number | null;
      purchase_date: string | null;
      status: string;
      country: string;
      currency: string;
      wo_count: number;
      wo_with_cost: number;
    }>;

  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const odo: OdoPoint[] = [];

  const checks = db
    .prepare(
      `SELECT vehicle_id, mileage_km, check_date, remarks
       FROM driver_vehicle_checks
       WHERE mileage_km IS NOT NULL AND mileage_km > 0`
    )
    .all() as Array<{ vehicle_id: string; mileage_km: number; check_date: string; remarks: string | null }>;
  for (const row of checks) {
    if (!vehicleIds.has(row.vehicle_id)) continue;
    if (/odometer is broken/i.test(row.remarks ?? "")) continue;
    const date = asDay(row.check_date);
    if (!date) continue;
    odo.push({ vehicleId: row.vehicle_id, date, km: row.mileage_km });
  }

  const inspections = db
    .prepare("SELECT vehicle_id, items, created_at FROM inspections")
    .all() as Array<{ vehicle_id: string; items: string; created_at: string }>;
  for (const row of inspections) {
    if (!vehicleIds.has(row.vehicle_id)) continue;
    const km = mileageFromInspectionItems(row.items || "[]");
    const date = asDay(row.created_at);
    if (km == null || !date) continue;
    odo.push({ vehicleId: row.vehicle_id, date, km });
  }

  const trips = db
    .prepare("SELECT vehicle_id, odo_start, odo_end, checkout_at, checkin_at FROM trips")
    .all() as Array<{
      vehicle_id: string;
      odo_start: number | null;
      odo_end: number | null;
      checkout_at: string | null;
      checkin_at: string | null;
    }>;
  for (const row of trips) {
    if (!vehicleIds.has(row.vehicle_id)) continue;
    const start = asDay(row.checkout_at);
    const end = asDay(row.checkin_at);
    if (start && row.odo_start && row.odo_start > 0) odo.push({ vehicleId: row.vehicle_id, date: start, km: row.odo_start });
    if (end && row.odo_end && row.odo_end > 0) odo.push({ vehicleId: row.vehicle_id, date: end, km: row.odo_end });
  }

  const orders = db
    .prepare(
      `SELECT wo.vehicle_id, wo.created_at, wo.downtime_start, wo.downtime_end, wo.odo_at_report,
              COALESCE(wo.parts_cost, 0) + COALESCE(wo.labour_cost, 0) + COALESCE(wo.third_party_cost, 0) as summed,
              COALESCE(wo.total_cost, 0) as total_cost,
              COALESCE((SELECT SUM(approved_amount) FROM pr_cost_cache p WHERE p.work_order_id = wo.id), 0) as pr_amt,
              COALESCE((SELECT SUM(amount) FROM work_order_po_links l WHERE l.work_order_id = wo.id), 0) as po_amt,
              COALESCE((SELECT SUM(COALESCE(quantity,0)*COALESCE(unit_cost,0)) FROM parts pt WHERE pt.work_order_id = wo.id), 0) as parts_lines,
              COALESCE((SELECT SUM(COALESCE(hours,0)*COALESCE(rate_per_hour,0)) FROM work_order_labor lb WHERE lb.work_order_id = wo.id), 0) as labour_lines
       FROM work_orders wo`
    )
    .all() as Array<{
      vehicle_id: string;
      created_at: string;
      downtime_start: string | null;
      downtime_end: string | null;
      odo_at_report: number | null;
      summed: number;
      total_cost: number;
      pr_amt: number;
      po_amt: number;
      parts_lines: number;
      labour_lines: number;
    }>;

  const repairs: SpendEvent[] = [];
  const downtime: FleetSourceData["downtime"] = [];
  for (const row of orders) {
    if (!vehicleIds.has(row.vehicle_id)) continue;
    const date = asDay(row.created_at);
    const total = row.total_cost > 0 ? row.total_cost : row.summed;
    const lineItems = row.parts_lines + row.labour_lines;
    const chosen = chooseRepairAmount(row.pr_amt, row.po_amt, total, lineItems);
    if (chosen && date) {
      repairs.push({ vehicleId: row.vehicle_id, date, amount: chosen.amount, source: chosen.source });
    }
    const reported = asDay(row.created_at);
    if (reported && row.odo_at_report && row.odo_at_report > 0) {
      odo.push({ vehicleId: row.vehicle_id, date: reported, km: row.odo_at_report });
    }
    const start = asDay(row.downtime_start);
    if (start) downtime.push({ vehicleId: row.vehicle_id, start, end: asDay(row.downtime_end) });
  }

  const body: FleetSourceData = {
    asOf,
    organizations,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      code: v.code,
      country: v.country,
      currency: v.currency || "LSL",
      year: v.year || null,
      purchasePrice: v.purchase_price || 0,
      purchaseDate: asDay(v.purchase_date),
      status: v.status,
      workOrderCount: v.wo_count || 0,
      workOrdersWithCost: v.wo_with_cost || 0,
    })),
    odo,
    repairs,
    downtime,
  };
  return NextResponse.json(body);
}
