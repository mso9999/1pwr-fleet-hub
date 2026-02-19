import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const vehicleId = searchParams.get("vehicleId");
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

  let query = `
    SELECT r.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM vehicle_tracking_reports r
    JOIN vehicles v ON r.vehicle_id = v.id
    WHERE r.organization_id = ?
  `;
  const params: unknown[] = [org];

  if (vehicleId) {
    query += " AND r.vehicle_id = ?";
    params.push(vehicleId);
  }
  if (from) {
    query += " AND r.report_date >= ?";
    params.push(from);
  }
  if (to) {
    query += " AND r.report_date <= ?";
    params.push(to);
  }

  query += " ORDER BY r.report_date DESC, v.code ASC LIMIT ?";
  params.push(limit);

  const reports = db.prepare(query).all(...params);
  return NextResponse.json(reports);
}
