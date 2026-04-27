import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { evaluateTripReadiness } from "@/lib/trip-readiness";
import { canOverridePrerequisite } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");
  const active = searchParams.get("active");

  const org = searchParams.get("org") || "1pwr_lesotho";
  const allOrgs = searchParams.get("allOrgs") === "true" && vehicleId;

  let query = `
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    WHERE ${allOrgs ? "t.vehicle_id = ?" : "t.organization_id = ?"}
  `;
  const params: string[] = allOrgs ? [vehicleId as string] : [org];

  if (!allOrgs && vehicleId) {
    query += " AND t.vehicle_id = ?";
    params.push(vehicleId);
  }
  if (active === "true") {
    query += " AND t.checkin_at IS NULL";
  }

  query += " ORDER BY t.checkout_at DESC LIMIT 100";

  const trips = db.prepare(query).all(...params);
  return NextResponse.json(trips);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();
  const organizationId = body.organizationId || "1pwr_lesotho";

  const readiness = evaluateTripReadiness(db, {
    organizationId,
    vehicleId: body.vehicleId,
    missionProfile: body.missionProfile,
    checkDate: now.slice(0, 10),
    referenceNow: new Date(now),
  });

  const overrideReasonRaw = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
  let overrideApplied = false;

  if (!readiness.ok) {
    if (overrideReasonRaw.length === 0) {
      return NextResponse.json(
        {
          error: "Trip readiness requirements are not met. Complete the items below, then try again.",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
        },
        { status: 400 },
      );
    }
    if (!canOverridePrerequisite(db, organizationId, user.email, user.role)) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to override the trip readiness gate. Ask a fleet manager or PR-credentialed approver.",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
        },
        { status: 403 },
      );
    }
    if (overrideReasonRaw.length < 8) {
      return NextResponse.json(
        {
          error: "Provide a longer override reason (at least 8 characters) so this bypass is auditable.",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
        },
        { status: 400 },
      );
    }
    overrideApplied = true;
  }

  db.prepare(`
    INSERT INTO trips (
      id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
      departure_location, destination, mission_type, mission_profile, passengers, load_out, load_in, checkout_at,
      authorized_driver_verified, approved_drivers, loadout_manifest,
      expected_return_at, mission_priority, approval_status, approved_by, am_allocation_ids
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    body.vehicleId,
    body.driverId || "",
    body.driverName || "",
    body.odoStart,
    body.departureLocation,
    body.destination,
    body.missionType || "other",
    readiness.missionProfile,
    body.passengers || "",
    body.loadOut || "",
    body.loadIn || "",
    now,
    body.authorizedDriverVerified ? 1 : 0,
    JSON.stringify(body.approvedDrivers || []),
    JSON.stringify(body.loadoutManifest || []),
    body.expectedReturnAt || null,
    body.missionPriority || "normal",
    body.approvalStatus || "auto-approved",
    body.approvedBy || "",
    JSON.stringify(body.amAllocationIds || [])
  );

  // Insert multi-stop itinerary if provided
  if (Array.isArray(body.stops) && body.stops.length > 0) {
    const stopStmt = db.prepare(`
      INSERT INTO trip_stops (id, trip_id, stop_number, location, load_out, load_in, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < body.stops.length; i++) {
      const s = body.stops[i];
      stopStmt.run(id, i + 1, s.location, s.loadOut || "", s.loadIn || "", s.notes || "");
    }
  }

  const vehicleBefore = db.prepare("SELECT status FROM vehicles WHERE id = ?").get(body.vehicleId) as { status: string } | undefined;

  db.prepare("UPDATE vehicles SET current_location = ?, status = 'deployed', updated_at = ? WHERE id = ?")
    .run(body.destination, now, body.vehicleId);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("vehicle", body.vehicleId, vehicleBefore?.status || "operational", "deployed", body.driverName || "", now);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("trip", id, null, "checked-out", body.driverName || "", now);

  if (overrideApplied) {
    recordMutation(db, {
      entityType: "trip",
      entityId: id,
      organizationId,
      action: "prerequisite_override",
      actor: actorFrom(user),
      after: {
        vehicleId: body.vehicleId,
        missionProfile: readiness.missionProfile,
        gatesBypassed: readiness.gates
          .filter((g) => g.status !== "satisfied")
          .map((g) => ({ id: g.id, label: g.label, detail: g.detail })),
      },
      reason: overrideReasonRaw,
    });
  }

  const trip = db.prepare(`
    SELECT t.*, v.code as vehicle_code FROM trips t JOIN vehicles v ON t.vehicle_id = v.id WHERE t.id = ?
  `).get(id);
  return NextResponse.json(trip, { status: 201 });
}
