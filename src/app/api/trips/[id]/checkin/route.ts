import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();
  const user = await getVerifiedFleetUser(request);

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const distance = body.odoEnd ? body.odoEnd - (trip.odo_start as number) : null;

  db.prepare(`
    UPDATE trips SET odo_end = ?, arrival_location = ?, checkin_at = ?, issues_observed = ?, load_in = ?, distance = ?
    WHERE id = ?
  `).run(
    body.odoEnd || null,
    body.arrivalLocation || "",
    now,
    body.issuesObserved || "",
    body.loadIn || "",
    distance,
    id
  );

  const missionId = trip.mission_id ? String(trip.mission_id) : "";
  if (missionId) {
    db.prepare(`UPDATE missions SET trip_id = NULL, updated_at = ? WHERE id = ? AND trip_id = ?`).run(
      now,
      missionId,
      id
    );
  }

  db.prepare("UPDATE vehicles SET current_location = ?, status = 'operational', updated_at = ? WHERE id = ?")
    .run(body.arrivalLocation || "", now, trip.vehicle_id);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("vehicle", trip.vehicle_id, "deployed", "operational", String(trip.driver_name || ""), now);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("trip", id, "checked-out", "checked-in", String(trip.driver_name || ""), now);

  if (body.odoEnd) {
    db.prepare("UPDATE vehicles SET total_mileage_km = MAX(total_mileage_km, ?) WHERE id = ?")
      .run(body.odoEnd, trip.vehicle_id);
  }

  const updated = db.prepare(`
    SELECT t.*, v.code as vehicle_code FROM trips t JOIN vehicles v ON t.vehicle_id = v.id WHERE t.id = ?
  `).get(id);

  recordMutation(db, {
    entityType: "trip",
    entityId: id,
    organizationId: String(trip.organization_id ?? ""),
    action: "checkin",
    actor: auditActorFrom(user, {
      id: String(trip.driver_id ?? ""),
      name: String(trip.driver_name ?? ""),
    }),
    before: {
      checkin_at: trip.checkin_at,
      odo_end: trip.odo_end,
      vehicle_status: "deployed",
    },
    after: {
      odo_end: body.odoEnd ?? null,
      arrival_location: body.arrivalLocation || "",
      checkin_at: now,
      vehicle_status: "operational",
    },
  });

  return NextResponse.json(updated);
}
