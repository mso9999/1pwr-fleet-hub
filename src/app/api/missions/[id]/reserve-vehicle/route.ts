import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicle, canOverrideReservationOverlap } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import {
  findActiveReservationConflicts,
  vehicleStatusAllowedForReservation,
} from "@/lib/mission-reservations";

/**
 * POST /api/missions/[id]/reserve-vehicle
 * Body: { vehicleId: string, overrideReason?: string } — fleet lead reserves a vehicle for an approved mission.
 * Overlapping active reservations require manager+ override reason.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: missionId } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAllocateFleetVehicle(user.role)) {
    return NextResponse.json(
      { error: "Only the fleet team lead (or superadmin) may reserve a vehicle on a mission." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const overrideReason = String(body.overrideReason || "").trim();
  const db = getDb();

  const mission = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as
    | Record<string, unknown>
    | undefined;
  if (!mission) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  const orgId = String(mission.organization_id ?? "");
  if (String(mission.approval_status || "").toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Mission must be approved before reserving a vehicle." }, { status: 400 });
  }
  if (String(mission.lifecycle_status || "active").toLowerCase() !== "active") {
    return NextResponse.json(
      { error: "Mission is deferred or cancelled; reactivate it before assigning." },
      { status: 400 }
    );
  }

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  if (String(vehicle.organization_id) !== orgId) {
    return NextResponse.json({ error: "Vehicle belongs to a different organization." }, { status: 400 });
  }

  const dep = String(mission.departure_date || "").slice(0, 10);
  const retRaw = String(mission.return_date || "").trim();
  const endDate = (retRaw ? retRaw.slice(0, 10) : dep) || dep;
  if (!dep) {
    return NextResponse.json({ error: "Mission has no departure_date." }, { status: 400 });
  }

  const vStatus = String(vehicle.status || "");
  if (!vehicleStatusAllowedForReservation(vStatus, dep)) {
    return NextResponse.json(
      {
        error: `Vehicle ${vehicle.code} cannot be reserved for this departure date (status: ${vStatus}).`,
        reason: "vehicle_status_not_allowed",
      },
      { status: 400 }
    );
  }

  const reqClass = String(mission.required_vehicle_class || "").trim();
  const assetClass = String(vehicle.asset_class || "").trim();
  if (reqClass && assetClass && reqClass !== assetClass) {
    return NextResponse.json(
      {
        error: `Vehicle asset class (${assetClass}) does not match mission required class (${reqClass}).`,
        reason: "asset_class_mismatch",
      },
      { status: 400 }
    );
  }

  const conflicts = findActiveReservationConflicts(db, orgId, vehicleId, dep, endDate, missionId);
  if (conflicts.length > 0) {
    const canOverride = canOverrideReservationOverlap(user.role) && overrideReason.length >= 8;
    if (!canOverride) {
      return NextResponse.json(
        {
          error:
            "This vehicle already has an overlapping reservation. Provide overrideReason (8+ chars) as a manager or admin.",
          conflicts,
          reason: "reservation_overlap",
        },
        { status: 409 }
      );
    }
    recordMutation(db, {
      entityType: "mission",
      entityId: missionId,
      organizationId: orgId,
      action: "reservation_overlap_override",
      actor: actorFrom(user),
      after: { conflicts, overrideReason },
    });
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE vehicle_reservations SET status = 'superseded', updated_at = ? WHERE mission_id = ? AND status = 'active'`
    ).run(now, missionId);

    db.prepare(
      `
      INSERT INTO vehicle_reservations (
        id, organization_id, vehicle_id, mission_id, start_date, end_date, status,
        override_reason, override_by_id, override_by_name, created_at, updated_at
      ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `
    ).run(
      orgId,
      vehicleId,
      missionId,
      dep,
      endDate,
      conflicts.length > 0 ? overrideReason : "",
      conflicts.length > 0 ? user.id : "",
      conflicts.length > 0 ? user.name || user.email : "",
      now,
      now
    );

    db.prepare(
      `UPDATE missions SET assigned_vehicle_id = ?, assigned_at = ?, assigned_by_id = ?, assigned_by_name = ?,
       updated_at = ? WHERE id = ?`
    ).run(vehicleId, now, user.id, user.name || user.email, now, missionId);
  });

  try {
    tx();
  } catch (e) {
    console.error("[reserve-vehicle]", e);
    return NextResponse.json({ error: "Reservation failed." }, { status: 500 });
  }

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId);
  return NextResponse.json(updated, { status: 200 });
}
