import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { evaluateReadinessForMissionLinkedTrip } from "@/lib/mission-deployment-readiness";
import { assertMissionEligibleForTripCheckout } from "@/lib/mission-checkout";
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
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
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
  const rawVehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const hasVehicle = rawVehicleId.length > 0;

  const overrideReasonRaw = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
  let overrideApplied = false;
  let missionReadiness: ReturnType<typeof evaluateReadinessForMissionLinkedTrip> | null = null;
  const missionIdRaw = typeof body.missionId === "string" ? body.missionId.trim() : "";

  if (!hasVehicle) {
    return NextResponse.json(
      {
        error:
          "Trip checkout requires a vehicle and an approved mission. Plan the mission, get management approval, have fleet reserve a vehicle, then check out here.",
      },
      { status: 400 }
    );
  }

  if (!missionIdRaw) {
    return NextResponse.json(
      {
        error: "missionId is required. Every operational trip must be linked to an approved mission.",
      },
      { status: 400 }
    );
  }

  const eligible = assertMissionEligibleForTripCheckout(db, organizationId, missionIdRaw);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.error, code: eligible.code }, { status: 409 });
  }

  missionReadiness = evaluateReadinessForMissionLinkedTrip(db, {
    organizationId,
    missionId: missionIdRaw,
    vehicleId: rawVehicleId,
    checkDate: now.slice(0, 10),
    referenceNow: new Date(now),
  });
  if (!missionReadiness.ok) {
    if (overrideReasonRaw.length === 0) {
      return NextResponse.json(
        {
          error: "Trip readiness requirements are not met for this mission-linked checkout.",
          gates: missionReadiness.gates,
          missionProfile: missionReadiness.missionProfile,
          missionBlockedReason: missionReadiness.missionBlockedReason,
        },
        { status: 400 },
      );
    }
    if (!canOverridePrerequisite(db, organizationId, user.email, user.role)) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to override the trip readiness gate. Ask a fleet manager or PR-credentialed approver.",
          gates: missionReadiness.gates,
          missionProfile: missionReadiness.missionProfile,
        },
        { status: 403 },
      );
    }
    if (overrideReasonRaw.length < 8) {
      return NextResponse.json(
        {
          error: "Provide a longer override reason (at least 8 characters) so this bypass is auditable.",
          gates: missionReadiness.gates,
          missionProfile: missionReadiness.missionProfile,
        },
        { status: 400 },
      );
    }
    overrideApplied = true;
  }

  const resolvedMissionProfile = missionReadiness?.missionProfile ?? body.missionProfile ?? "local";
  const odoStart =
    body.odoStart === undefined || body.odoStart === null || body.odoStart === ""
      ? null
      : Number(body.odoStart);
  const defaultApprovalStatus = "auto-approved";

  db.prepare(`
    INSERT INTO trips (
      id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
      departure_location, destination, mission_type, mission_profile, passengers, load_out, load_in, checkout_at,
      authorized_driver_verified, approved_drivers, loadout_manifest,
      expected_return_at, mission_priority, approval_status, approved_by, am_allocation_ids,
      mission_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    rawVehicleId,
    body.driverId || "",
    body.driverName || "",
    odoStart,
    body.departureLocation,
    body.destination,
    body.missionType || "other",
    resolvedMissionProfile,
    body.passengers || "",
    body.loadOut || "",
    body.loadIn || "",
    now,
    body.authorizedDriverVerified ? 1 : 0,
    JSON.stringify(body.approvedDrivers || []),
    JSON.stringify(body.loadoutManifest || []),
    body.expectedReturnAt || null,
    body.missionPriority || "normal",
    body.approvalStatus || defaultApprovalStatus,
    body.approvedBy || "",
    JSON.stringify(body.amAllocationIds || []),
    missionIdRaw
  );

  db.prepare("UPDATE missions SET trip_id = ?, updated_at = ? WHERE id = ?").run(id, now, missionIdRaw);

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

  const vehicleBefore = db.prepare("SELECT status FROM vehicles WHERE id = ?").get(rawVehicleId) as { status: string } | undefined;

  db.prepare("UPDATE vehicles SET current_location = ?, status = 'deployed', updated_at = ? WHERE id = ?")
    .run(body.destination, now, rawVehicleId);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("vehicle", rawVehicleId, vehicleBefore?.status || "operational", "deployed", body.driverName || "", now);

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("trip", id, null, "checked-out", body.driverName || "", now);

  if (overrideApplied && missionReadiness) {
    const gates = missionReadiness.gates;
    recordMutation(db, {
      entityType: "trip",
      entityId: id,
      organizationId,
      action: "prerequisite_override",
      actor: actorFrom(user),
      after: {
        vehicleId: rawVehicleId,
        missionId: missionIdRaw || undefined,
        missionProfile: resolvedMissionProfile,
        gatesBypassed: gates
          .filter((g) => g.status !== "satisfied")
          .map((g) => ({ id: g.id, label: g.label, detail: g.detail })),
      },
      reason: overrideReasonRaw,
    });
  }

  const trip = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.id = ?
  `).get(id);
  return NextResponse.json(trip, { status: 201 });
}
