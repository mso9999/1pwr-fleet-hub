import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { normalizeRouteStops } from "@/lib/trip-route";
import { canEditPrivateDraft, canViewPrivateDraft } from "@/lib/fleet-roles";

function tripAuditSubset(r: Record<string, unknown>): Record<string, unknown> {
  return {
    driver_name: r.driver_name,
    odo_start: r.odo_start,
    odo_end: r.odo_end,
    destination: r.destination,
    departure_location: r.departure_location,
    checkin_at: r.checkin_at,
    mission_id: r.mission_id,
    vehicle_id: r.vehicle_id,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const isDraft = request.nextUrl.searchParams.get("draft") === "true";

  if (isDraft) {
    const user = await getVerifiedFleetUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const draft = db.prepare("SELECT * FROM trip_drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const canView = canViewPrivateDraft({
      role: user.role,
      department: user.department,
      isCreator: String(draft.created_by_id || "") === user.id,
    });
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(draft);
  }

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
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isDraft = request.nextUrl.searchParams.get("draft") === "true";

  if (isDraft) {
    const existingDraft = db.prepare("SELECT * FROM trip_drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!existingDraft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const canEdit = canEditPrivateDraft({
      role: user.role,
      department: user.department,
      isCreator: String(existingDraft.created_by_id || "") === user.id,
    });
    if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const prevPayload = JSON.parse(String(existingDraft.payload_json || "{}")) as Record<string, unknown>;
    const nextPayload = { ...prevPayload, ...body, updatedAt: new Date().toISOString() };
    db.prepare(
      `UPDATE trip_drafts
       SET mission_id = ?, payload_json = ?, updated_at = datetime('now'), expires_at = datetime('now', '+30 days')
       WHERE id = ?`
    ).run(String(body.missionId || existingDraft.mission_id || ""), JSON.stringify(nextPayload), id);
    const updatedDraft = db.prepare("SELECT * FROM trip_drafts WHERE id = ?").get(id) as Record<string, unknown>;
    return NextResponse.json(updatedDraft);
  }

  const existing = db.prepare("SELECT * FROM trips WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  const beforeSnap = tripAuditSubset(existing as Record<string, unknown>);

  const allowedFields: Record<string, string> = {
    driverName: "driver_name",
    driverId: "driver_id",
    odoStart: "odo_start",
    odoEnd: "odo_end",
    departureLocation: "departure_location",
    destination: "destination",
    arrivalLocation: "arrival_location",
    missionType: "mission_type",
    tripShape: "trip_shape",
    missionProfile: "mission_profile",
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

  if (fields.length === 0 && body.stops === undefined) {
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

  const incomingStops = body.stops !== undefined ? normalizeRouteStops(body.stops) : null;
  const tx = db.transaction(() => {
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE trips SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }
    if (incomingStops !== null) {
      db.prepare("DELETE FROM trip_stops WHERE trip_id = ?").run(id);
      if (incomingStops.length > 0) {
        const insStop = db.prepare(`
          INSERT INTO trip_stops (id, trip_id, stop_number, location, load_out, load_in, notes)
          VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
        `);
        for (let i = 0; i < incomingStops.length; i += 1) {
          const s = incomingStops[i];
          insStop.run(id, i + 1, s.location, s.loadOut, s.loadIn, s.notes);
        }
      }
    }
  });
  tx();

  const updated = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id WHERE t.id = ?
  `).get(id);

  const updatedStops = db
    .prepare("SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY stop_number ASC")
    .all(id) as Record<string, unknown>[];

  recordMutation(db, {
    entityType: "trip",
    entityId: id,
    organizationId: String((existing as Record<string, unknown>).organization_id ?? ""),
    action: "update",
    actor: actorFrom(user),
    before: beforeSnap,
    after: {
      ...tripAuditSubset(updated as Record<string, unknown>),
      stop_count: updatedStops.length,
    },
  });

  return NextResponse.json({ ...(updated as Record<string, unknown>), stops: updatedStops });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isDraft = request.nextUrl.searchParams.get("draft") === "true";

  if (isDraft) {
    const draft = db.prepare("SELECT * FROM trip_drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const canDelete = canEditPrivateDraft({
      role: user.role,
      department: user.department,
      isCreator: String(draft.created_by_id || "") === user.id,
    });
    if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    db.prepare("DELETE FROM trip_drafts WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  }

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  recordMutation(db, {
    entityType: "trip",
    entityId: id,
    organizationId: String(trip.organization_id ?? ""),
    action: "delete",
    actor: actorFrom(user),
    before: tripAuditSubset(trip),
  });

  db.prepare("DELETE FROM trip_stops WHERE trip_id = ?").run(id);
  db.prepare("DELETE FROM trips WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
