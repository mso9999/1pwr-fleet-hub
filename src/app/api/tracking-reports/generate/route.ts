import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
  const db = getDb();
  const body = await request.json();
  const org = body.organizationId || "1pwr_lesotho";
  const reportDate = body.reportDate || new Date().toISOString().slice(0, 10);
  const periodStart = body.periodStart || reportDate;
  const periodEnd = body.periodEnd || reportDate;
  const vehicleId = body.vehicleId;

  let vehicleFilter = "";
  const baseParams: unknown[] = [org];
  if (vehicleId) {
    vehicleFilter = " AND v.id = ?";
    baseParams.push(vehicleId);
  }

  const vehicles = db.prepare(
    `SELECT v.id, v.code FROM vehicles v WHERE v.organization_id = ? AND v.tracker_imei != '' AND v.tracker_status = 'active'${vehicleFilter}`
  ).all(...baseParams) as Array<{ id: string; code: string }>;

  if (vehicles.length === 0) {
    return NextResponse.json({
      error: "No vehicles with active trackers found. Assign IMEI numbers and set tracker status to 'active' first.",
      generated: 0,
    }, { status: 400 });
  }

  const insertReport = db.prepare(`
    INSERT INTO vehicle_tracking_reports (
      id, organization_id, vehicle_id, report_date, period_start, period_end,
      total_distance_km, total_trips, total_driving_hours, total_idle_hours,
      max_speed_kmh, avg_speed_kmh, geofence_violations,
      harsh_braking_events, harsh_acceleration_events, after_hours_usage_minutes,
      fuel_consumed_liters, start_location, end_location,
      report_source, raw_data, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const generated: string[] = [];

  const generateAll = db.transaction(() => {
    for (const v of vehicles) {
      const existing = db.prepare(
        "SELECT id FROM vehicle_tracking_reports WHERE vehicle_id = ? AND report_date = ?"
      ).get(v.id, reportDate);
      if (existing) continue;

      const trips = db.prepare(`
        SELECT t.*, 
          COALESCE(t.distance, 0) as dist,
          t.departure_location, t.arrival_location
        FROM trips t
        WHERE t.vehicle_id = ? AND date(t.checkout_at) >= ? AND date(t.checkout_at) <= ?
      `).all(v.id, periodStart, periodEnd) as Array<{
        dist: number;
        departure_location: string;
        arrival_location: string;
        checkout_at: string;
        checkin_at: string | null;
      }>;

      const totalDistanceKm = trips.reduce((sum, t) => sum + (t.dist || 0), 0);
      const totalTrips = trips.length;

      let totalDrivingHours = 0;
      for (const t of trips) {
        if (t.checkout_at && t.checkin_at) {
          const start = new Date(t.checkout_at).getTime();
          const end = new Date(t.checkin_at).getTime();
          if (end > start) totalDrivingHours += (end - start) / 3600000;
        }
      }

      const startLocation = trips.length > 0 ? trips[0].departure_location : "";
      const endLocation = trips.length > 0 ? (trips[trips.length - 1].arrival_location || trips[trips.length - 1].departure_location) : "";

      const reportId = uuidv4();
      insertReport.run(
        reportId, org, v.id, reportDate, periodStart, periodEnd,
        totalDistanceKm, totalTrips,
        Math.round(totalDrivingHours * 100) / 100, 0,
        0, totalDistanceKm > 0 && totalDrivingHours > 0 ? Math.round(totalDistanceKm / totalDrivingHours) : 0,
        0, 0, 0, 0, 0,
        startLocation, endLocation,
        "auto-generated",
        JSON.stringify({ tripIds: trips.map((t: Record<string, unknown>) => (t as { id: string }).id) }),
        `Auto-generated from ${totalTrips} trip(s) for ${v.code}`
      );
      generated.push(v.code);
    }
  });

  generateAll();

  return NextResponse.json({
    generated: generated.length,
    vehicles: generated,
    reportDate,
    periodStart,
    periodEnd,
    skippedExisting: vehicles.length - generated.length,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
