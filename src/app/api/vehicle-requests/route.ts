import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";

  let query = `
    SELECT vr.*,
           av.code as assigned_vehicle_code, av.make as assigned_vehicle_make, av.model as assigned_vehicle_model
    FROM vehicle_requests vr
    LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
    WHERE vr.organization_id = ?
  `;
  const params: unknown[] = [org];

  const status = sp.get("status");
  if (status) { query += " AND vr.status = ?"; params.push(status); }

  const requestedById = sp.get("requestedById");
  if (requestedById) { query += " AND vr.requested_by_id = ?"; params.push(requestedById); }

  const pending = sp.get("pending");
  if (pending === "true") { query += " AND vr.status IN ('requested', 'approved')"; }

  query += " ORDER BY CASE vr.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, vr.created_at DESC LIMIT 200";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO vehicle_requests (
      id, organization_id, requested_by_id, requested_by_name, requested_for,
      vehicle_id, purpose, destination, departure_date, return_date,
      passengers, required_vehicle_class, loadout_description,
      priority, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?)
  `).run(
    id,
    body.organizationId || "1pwr_lesotho",
    body.requestedById || "",
    body.requestedByName || "",
    body.requestedFor || "",
    body.vehicleId || null,
    body.purpose || "",
    body.destination || "",
    body.departureDate || "",
    body.returnDate || "",
    body.passengers || "",
    body.requiredVehicleClass || "",
    body.loadoutDescription || "",
    body.priority || "normal",
    body.notes || "",
    now,
    now
  );

  const row = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
