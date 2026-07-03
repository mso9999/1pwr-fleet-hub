import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicle, canOverrideReservationOverlap } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import {
  findActiveReservationConflicts,
  vehicleStatusAllowedForReservation,
} from "@/lib/mission-reservations";
import {
  registrationDiscMissionBlocked,
  registrationDiscOverrideAllowed,
} from "@/lib/registration-disc";
import {
  localityGateRequired,
  LOCALITY_RADIUS_KM,
} from "@/lib/locality-gate";

/**
 * POST /api/missions/[id]/reserve-vehicle
 * Body: { vehicleId: string, overrideReason?: string } — fleet lead reserves a vehicle for an approved mission.
 * Overlapping active reservations require manager+ override reason.
 * Mission window past registration disc expiry requires PR/manager override (same overrideReason, 8+ chars).
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

  // Locality gate: if the destination is > LOCALITY_RADIUS_KM from the vehicle's
  // current location, require a passing detailed mechanical inspection within
  // the max-age window — or a fleet-lead override reason (8+ chars).
  const destinationCode = String(mission.destination || "").trim();
  if (destinationCode) {
    const gate = localityGateRequired(db, orgId, vehicleId, destinationCode);
    if (gate.required && !gate.inspectionOnFile) {
      const overrideOk = canAllocateFleetVehicle(user.role) && overrideReason.length >= 8;
      if (!overrideOk) {
        return NextResponse.json(
          {
            error: gate.reason,
            reason: "needs_mechanical_inspection",
            distanceKm: gate.distanceKm,
            localityRadiusKm: LOCALITY_RADIUS_KM,
          },
          { status: 400 }
        );
      }
      recordMutation(db, {
        entityType: "mission",
        entityId: missionId,
        organizationId: orgId,
        action: "prerequisite_override",
        actor: actorFrom(user),
        after: {
          vehicleId,
          vehicleCode: vehicle.code,
          localityGate: { distanceKm: gate.distanceKm, radiusKm: LOCALITY_RADIUS_KM },
          gatesBypassed: ["mechanical_inspection_locality"],
        },
        reason: overrideReason,
      });
    }
  }

  const discBlocked = registrationDiscMissionBlocked(endDate, vehicle.registration_disc_expiry_date);
  let discOverrideUsed = false;
  if (discBlocked) {
    if (!(await registrationDiscOverrideAllowed(db, orgId, user.email, user.role, overrideReason))) {
      const discExpiry = String(vehicle.registration_disc_expiry_date || "").slice(0, 10);
      return NextResponse.json(
        {
          error: `Mission runs until ${endDate} but ${vehicle.code}'s registration disc expires ${discExpiry}. A PR-credentialed approver or manager must supply overrideReason (8+ characters) to reserve this vehicle.`,
          reason: "registration_disc_exceeded",
          missionEnd: endDate,
          discExpiry,
        },
        { status: 400 }
      );
    }
    discOverrideUsed = true;
    recordMutation(db, {
      entityType: "mission",
      entityId: missionId,
      organizationId: orgId,
      action: "registration_disc_reservation_override",
      actor: actorFrom(user),
      after: {
        vehicleId,
        vehicleCode: vehicle.code,
        missionEnd: endDate,
        discExpiry: String(vehicle.registration_disc_expiry_date || "").slice(0, 10),
      },
      reason: overrideReason,
    });
  }

  const conflicts = findActiveReservationConflicts(db, orgId, vehicleId, dep, endDate, missionId);
  const beforeAssigned = mission.assigned_vehicle_id;
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
      conflicts.length > 0 || discOverrideUsed ? overrideReason : "",
      conflicts.length > 0 || discOverrideUsed ? user.id : "",
      conflicts.length > 0 || discOverrideUsed ? user.name || user.email : "",
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

  recordMutation(db, {
    entityType: "mission",
    entityId: missionId,
    organizationId: orgId,
    action: "update",
    actor: actorFrom(user),
    before: {
      assigned_vehicle_id: beforeAssigned,
      hadOverlapOverride: conflicts.length > 0,
    },
    after: {
      assigned_vehicle_id: vehicleId,
      reservationWindow: { start: dep, end: endDate },
      hadOverlapOverride: conflicts.length > 0,
      hadRegistrationDiscOverride: discOverrideUsed,
    },
  });

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId);
  return NextResponse.json(updated, { status: 200 });
}
