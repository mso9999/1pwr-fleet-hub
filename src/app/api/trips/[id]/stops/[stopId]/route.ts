import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> }
): Promise<NextResponse> {
  const { id: tripId, stopId } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const trip = db
    .prepare("SELECT id, organization_id FROM trips WHERE id = ?")
    .get(tripId) as { id: string; organization_id: string } | undefined;
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const existing = db
    .prepare("SELECT * FROM trip_stops WHERE id = ? AND trip_id = ?")
    .get(stopId, tripId) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Stop not found" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "arrive") {
    db.prepare("UPDATE trip_stops SET arrived_at = COALESCE(arrived_at, ?), odo_reading = ? WHERE id = ?")
      .run(now, body.odoReading ?? null, stopId);
  } else if (action === "depart") {
    db.prepare(
      "UPDATE trip_stops SET departed_at = COALESCE(departed_at, ?), odo_reading = COALESCE(?, odo_reading) WHERE id = ?"
    ).run(now, body.odoReading ?? null, stopId);
  } else {
    db.prepare(
      `UPDATE trip_stops
       SET load_out = ?, load_in = ?, notes = ?, odo_reading = ?
       WHERE id = ?`
    ).run(
      String(body.loadOut || ""),
      String(body.loadIn || ""),
      String(body.notes || ""),
      body.odoReading ?? null,
      stopId
    );
  }

  const updated = db
    .prepare("SELECT * FROM trip_stops WHERE id = ?")
    .get(stopId) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "trip",
    entityId: tripId,
    organizationId: trip.organization_id,
    action: "update",
    actor: actorFrom(user),
    before: { stop: existing },
    after: { stop: updated, action: action || "update" },
  });

  return NextResponse.json(updated);
}
