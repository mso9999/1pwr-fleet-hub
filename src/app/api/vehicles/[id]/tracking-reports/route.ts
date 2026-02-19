import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(id);
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") || 90), 365);

  let query = `
    SELECT r.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM vehicle_tracking_reports r
    JOIN vehicles v ON r.vehicle_id = v.id
    WHERE r.vehicle_id = ?
  `;
  const queryParams: unknown[] = [id];

  if (from) {
    query += " AND r.report_date >= ?";
    queryParams.push(from);
  }
  if (to) {
    query += " AND r.report_date <= ?";
    queryParams.push(to);
  }

  query += " ORDER BY r.report_date DESC LIMIT ?";
  queryParams.push(limit);

  const reports = db.prepare(query).all(...queryParams);
  return NextResponse.json(reports);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const vehicle = db.prepare("SELECT id, organization_id FROM vehicles WHERE id = ?").get(id) as
    | { id: string; organization_id: string }
    | undefined;
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  if (!body.reportDate || !body.periodStart || !body.periodEnd) {
    return NextResponse.json({ error: "reportDate, periodStart, periodEnd are required" }, { status: 400 });
  }

  const reportId = uuidv4();

  db.prepare(`
    INSERT INTO vehicle_tracking_reports (
      id, organization_id, vehicle_id, report_date, period_start, period_end,
      total_distance_km, total_trips, total_driving_hours, total_idle_hours,
      max_speed_kmh, avg_speed_kmh, geofence_violations,
      harsh_braking_events, harsh_acceleration_events, after_hours_usage_minutes,
      fuel_consumed_liters, start_location, end_location,
      report_source, raw_data, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reportId,
    vehicle.organization_id,
    id,
    body.reportDate,
    body.periodStart,
    body.periodEnd,
    body.totalDistanceKm || 0,
    body.totalTrips || 0,
    body.totalDrivingHours || 0,
    body.totalIdleHours || 0,
    body.maxSpeedKmh || 0,
    body.avgSpeedKmh || 0,
    body.geofenceViolations || 0,
    body.harshBrakingEvents || 0,
    body.harshAccelerationEvents || 0,
    body.afterHoursUsageMinutes || 0,
    body.fuelConsumedLiters || 0,
    body.startLocation || "",
    body.endLocation || "",
    body.reportSource || "manual",
    JSON.stringify(body.rawData || {}),
    body.notes || ""
  );

  const report = db.prepare("SELECT * FROM vehicle_tracking_reports WHERE id = ?").get(reportId);
  return NextResponse.json(report, { status: 201 });
}
