import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function csvEscape(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const type = searchParams.get("type") || "work-orders";
  const format = searchParams.get("format") || "csv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (format !== "csv") {
    return NextResponse.json({ error: "Only format=csv is supported" }, { status: 400 });
  }

  const db = getDb();

  let filename = "export.csv";
  let csv = "";

  if (type === "work-orders") {
    let q = `
      SELECT wo.id, v.code as vehicle_code, wo.title, wo.status, wo.priority, wo.type,
             wo.repair_location, wo.assigned_to, wo.total_cost, wo.parts_cost, wo.labour_cost,
             wo.downtime_start, wo.downtime_end, wo.created_at, wo.updated_at,
             CASE WHEN wo.downtime_end IS NOT NULL THEN
               ROUND(julianday(wo.downtime_end) - julianday(wo.downtime_start), 2)
             ELSE
               ROUND(julianday('now') - julianday(wo.downtime_start), 2)
             END as downtime_days
      FROM work_orders wo
      JOIN vehicles v ON wo.vehicle_id = v.id
      WHERE wo.organization_id = ?
    `;
    const params: string[] = [org];
    if (from) {
      q += ` AND date(wo.created_at) >= date(?)`;
      params.push(from);
    }
    if (to) {
      q += ` AND date(wo.created_at) <= date(?)`;
      params.push(to);
    }
    q += ` ORDER BY wo.created_at DESC`;
    const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
    const headers = [
      "id",
      "vehicle_code",
      "title",
      "status",
      "priority",
      "type",
      "repair_location",
      "assigned_to",
      "total_cost",
      "parts_cost",
      "labour_cost",
      "downtime_start",
      "downtime_end",
      "created_at",
      "updated_at",
      "downtime_days",
    ];
    csv = rowsToCsv(headers, rows);
    filename = `work-orders-${org}.csv`;
  } else if (type === "vehicles") {
    const rows = db
      .prepare(
        `
      SELECT code, make, model, year, license_plate, asset_class, home_location, current_location,
             status, date_in_service, notes, created_at, updated_at
      FROM vehicles
      WHERE organization_id = ?
      ORDER BY code
    `
      )
      .all(org) as Record<string, unknown>[];
    const headers = [
      "code",
      "make",
      "model",
      "year",
      "license_plate",
      "asset_class",
      "home_location",
      "current_location",
      "status",
      "date_in_service",
      "notes",
      "created_at",
      "updated_at",
    ];
    csv = rowsToCsv(headers, rows);
    filename = `vehicles-${org}.csv`;
  } else if (type === "trips") {
    let q = `
      SELECT t.id, v.code as vehicle_code, t.driver_name, t.odo_start, t.odo_end, t.distance,
             t.departure_location, t.destination, t.mission_type, t.checkout_at, t.checkin_at,
             t.issues_observed
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      WHERE t.organization_id = ?
    `;
    const params: string[] = [org];
    if (from) {
      q += ` AND date(t.checkout_at) >= date(?)`;
      params.push(from);
    }
    if (to) {
      q += ` AND date(t.checkout_at) <= date(?)`;
      params.push(to);
    }
    q += ` ORDER BY t.checkout_at DESC`;
    const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
    const headers = [
      "id",
      "vehicle_code",
      "driver_name",
      "odo_start",
      "odo_end",
      "distance",
      "departure_location",
      "destination",
      "mission_type",
      "checkout_at",
      "checkin_at",
      "issues_observed",
    ];
    csv = rowsToCsv(headers, rows);
    filename = `trips-${org}.csv`;
  } else if (type === "cost-summary") {
    const rows = db
      .prepare(
        `
      SELECT v.code as vehicle_code,
             SUM(wo.total_cost) as total_cost_sum,
             COUNT(*) as work_order_count,
             SUM(CASE WHEN wo.downtime_end IS NOT NULL THEN
               ROUND(julianday(wo.downtime_end) - julianday(wo.downtime_start), 2)
             ELSE NULL END) as total_downtime_days_resolved
      FROM work_orders wo
      JOIN vehicles v ON wo.vehicle_id = v.id
      WHERE wo.organization_id = ?
      GROUP BY v.code
      ORDER BY total_cost_sum DESC
    `
      )
      .all(org) as Record<string, unknown>[];
    const headers = [
      "vehicle_code",
      "total_cost_sum",
      "work_order_count",
      "total_downtime_days_resolved",
    ];
    csv = rowsToCsv(headers, rows);
    filename = `cost-by-vehicle-${org}.csv`;
  } else if (type === "inspections") {
    let q = `
      SELECT i.id, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
             i.type, i.inspector_name, i.overall_pass, i.created_at,
             COALESCE(i.updated_at, i.created_at) as updated_at,
             i.items as items_json
      FROM inspections i
      JOIN vehicles v ON i.vehicle_id = v.id
      WHERE i.organization_id = ?
    `;
    const params: string[] = [org];
    if (from) {
      q += ` AND date(i.created_at) >= date(?)`;
      params.push(from);
    }
    if (to) {
      q += ` AND date(i.created_at) <= date(?)`;
      params.push(to);
    }
    q += ` ORDER BY i.created_at DESC`;
    const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
    const headers = [
      "id",
      "vehicle_code",
      "vehicle_make",
      "vehicle_model",
      "type",
      "inspector_name",
      "overall_pass",
      "created_at",
      "updated_at",
      "items_json",
    ];
    csv = rowsToCsv(headers, rows);
    filename = `inspections-${org}.csv`;
  } else if (type === "tco") {
    const rows = db.prepare(`
      SELECT v.code, v.make, v.model, v.year, v.fuel_type, v.transmission, v.asset_class, v.status,
             v.purchase_price, v.total_mileage_km, v.date_in_service, v.eol_score, v.eol_status,
             COALESCE(SUM(wo.total_cost), 0) as total_repair_cost,
             COUNT(wo.id) as work_order_count,
             COALESCE(SUM(CASE WHEN wo.downtime_end IS NOT NULL
               THEN ROUND(julianday(wo.downtime_end) - julianday(wo.downtime_start), 1) ELSE 0 END), 0) as total_downtime_days
      FROM vehicles v LEFT JOIN work_orders wo ON wo.vehicle_id = v.id
      WHERE v.organization_id = ? GROUP BY v.id ORDER BY total_repair_cost DESC
    `).all(org) as Record<string, unknown>[];
    csv = rowsToCsv(["code","make","model","year","fuel_type","transmission","asset_class","status","purchase_price","total_mileage_km","date_in_service","eol_score","eol_status","total_repair_cost","work_order_count","total_downtime_days"], rows);
    filename = `tco-${org}.csv`;
  } else if (type === "vehicle-checks") {
    let q = `
      SELECT dvc.id, v.code as vehicle_code, dvc.driver_name, dvc.check_date, dvc.direction,
             dvc.mileage_km, dvc.route_from, dvc.route_to, dvc.overall_pass,
             dvc.has_exceptions, dvc.exception_approved, dvc.approved_by, dvc.remarks,
             dvc.travel_phone_number, dvc.created_at
      FROM driver_vehicle_checks dvc JOIN vehicles v ON dvc.vehicle_id = v.id
      WHERE dvc.organization_id = ?
    `;
    const params: string[] = [org];
    if (from) { q += ` AND dvc.check_date >= ?`; params.push(from); }
    if (to) { q += ` AND dvc.check_date <= ?`; params.push(to); }
    q += ` ORDER BY dvc.created_at DESC`;
    const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
    csv = rowsToCsv(["id","vehicle_code","driver_name","check_date","direction","mileage_km","route_from","route_to","overall_pass","has_exceptions","exception_approved","approved_by","remarks","travel_phone_number","created_at"], rows);
    filename = `vehicle-checks-${org}.csv`;
  } else if (type === "scheduled-maintenance") {
    const rows = db.prepare(`
      SELECT sm.id, v.code as vehicle_code, sm.maintenance_type, sm.status,
             sm.interval_km, sm.interval_months, sm.last_performed_date, sm.last_performed_km,
             sm.next_due_date, sm.next_due_km, v.total_mileage_km as current_mileage, sm.work_order_id
      FROM scheduled_maintenance sm JOIN vehicles v ON sm.vehicle_id = v.id
      WHERE sm.organization_id = ? ORDER BY sm.status, sm.next_due_date
    `).all(org) as Record<string, unknown>[];
    csv = rowsToCsv(["id","vehicle_code","maintenance_type","status","interval_km","interval_months","last_performed_date","last_performed_km","next_due_date","next_due_km","current_mileage","work_order_id"], rows);
    filename = `maintenance-schedule-${org}.csv`;
  } else if (type === "vehicle-requests") {
    const rows = db.prepare(`
      SELECT vr.id, vr.requested_by_name, vr.requested_for, vr.purpose, vr.destination,
             vr.departure_date, vr.return_date, vr.priority, vr.status,
             vr.approved_by_name, av.code as assigned_vehicle, vr.created_at
      FROM vehicle_requests vr LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
      WHERE vr.organization_id = ? ORDER BY vr.created_at DESC
    `).all(org) as Record<string, unknown>[];
    csv = rowsToCsv(["id","requested_by_name","requested_for","purpose","destination","departure_date","return_date","priority","status","approved_by_name","assigned_vehicle","created_at"], rows);
    filename = `vehicle-requests-${org}.csv`;
  } else if (type === "personal-vehicle-reimbursements") {
    let q = `
      SELECT id, trip_date, requested_by_name, destination, trip_reason, personal_vehicle_justification,
             rate_band, fee_type, total_km, reimbursement_lsl, currency, status,
             approved_by_name, approved_at, rejection_reason, finance_reference,
             pool_operational_count_snapshot, created_at, updated_at
      FROM personal_vehicle_reimbursement_requests
      WHERE organization_id = ?
    `;
    const params: string[] = [org];
    if (from) {
      q += ` AND date(created_at) >= date(?)`;
      params.push(from);
    }
    if (to) {
      q += ` AND date(created_at) <= date(?)`;
      params.push(to);
    }
    q += ` ORDER BY created_at DESC`;
    const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
    csv = rowsToCsv(
      [
        "id",
        "trip_date",
        "requested_by_name",
        "destination",
        "trip_reason",
        "personal_vehicle_justification",
        "rate_band",
        "fee_type",
        "total_km",
        "reimbursement_lsl",
        "currency",
        "status",
        "approved_by_name",
        "approved_at",
        "rejection_reason",
        "finance_reference",
        "pool_operational_count_snapshot",
        "created_at",
        "updated_at",
      ],
      rows
    );
    filename = `personal-vehicle-reimbursements-${org}.csv`;
  } else {
    return NextResponse.json(
      {
        error:
          "Invalid type — use work-orders, vehicles, trips, cost-summary, inspections, tco, vehicle-checks, scheduled-maintenance, vehicle-requests, or personal-vehicle-reimbursements",
      },
      { status: 400 }
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
