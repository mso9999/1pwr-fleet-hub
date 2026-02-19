import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const distance = body.odoEnd ? body.odoEnd - (trip.odo_start as number) : null;

  db.prepare(`
    UPDATE trips SET odo_end = ?, arrival_location = ?, checkin_at = ?, issues_observed = ?, distance = ?
    WHERE id = ?
  `).run(body.odoEnd || null, body.arrivalLocation || "", now, body.issuesObserved || "", distance, id);

  db.prepare("UPDATE vehicles SET current_location = ?, status = 'operational', updated_at = ? WHERE id = ?")
    .run(body.arrivalLocation || "", now, trip.vehicle_id);

  const updated = db.prepare(`
    SELECT t.*, v.code as vehicle_code FROM trips t JOIN vehicles v ON t.vehicle_id = v.id WHERE t.id = ?
  `).get(id);
  return NextResponse.json(updated);
}
