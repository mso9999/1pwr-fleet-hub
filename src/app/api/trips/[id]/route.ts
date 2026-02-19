import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const trip = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.id = ?
  `).get(id);

  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const stops = db.prepare(
    "SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY stop_number ASC"
  ).all(id);

  return NextResponse.json({ ...(trip as Record<string, unknown>), stops });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const existing = db.prepare("SELECT * FROM trips WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const allowedFields: Record<string, string> = {
    driverName: "driver_name",
    driverId: "driver_id",
    odoStart: "odo_start",
    odoEnd: "odo_end",
    departureLocation: "departure_location",
    destination: "destination",
    arrivalLocation: "arrival_location",
    missionType: "mission_type",
    passengers: "passengers",
    loadOut: "load_out",
    loadIn: "load_in",
    checkoutAt: "checkout_at",
    checkinAt: "checkin_at",
    issuesObserved: "issues_observed",
    distance: "distance",
    source: "source",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Auto-calculate distance if both odo values present
  if (body.odoEnd !== undefined && body.odoStart !== undefined) {
    const dist = body.odoEnd - body.odoStart;
    if (dist >= 0) {
      fields.push("distance = ?");
      values.push(dist);
    }
  }

  values.push(id);
  db.prepare(`UPDATE trips SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id WHERE t.id = ?
  `).get(id);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const trip = db.prepare("SELECT id FROM trips WHERE id = ?").get(id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  db.prepare("DELETE FROM trip_stops WHERE trip_id = ?").run(id);
  db.prepare("DELETE FROM trips WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
