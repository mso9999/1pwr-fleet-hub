import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicle, canOverrideReservationOverlap } from "@/lib/vehicle-check-approvers";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import { VR_SELECT_FIELDS, VR_FROM_JOIN } from "@/lib/vehicle-request-queries";
import {
  findActiveReservationConflicts,
  vehicleStatusAllowedForReservation,
} from "@/lib/mission-reservations";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import {
  registrationDiscMissionBlocked,
  registrationDiscOverrideAllowed,
} from "@/lib/registration-disc";

/**
 * POST /api/vehicle-requests/[id]/assign
 *
 * Legacy: assigns operational vehicle to a vehicle_request row.
 * When the request is linked to a mission, also writes mission assignment + vehicle_reservations (mission-centric).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAllocateFleetVehicle(user.role)) {
    return NextResponse.json(
      { error: "Only the fleet team lead (or superadmin) may allocate vehicles to requests." },
      { status: 403 }
    );
  }
  const approverId = user.id;
  const approverName = user.name || user.email;

  const existing = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!body.vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(body.vehicleId) as Record<string, unknown> | undefined;
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const missionId = String(existing.mission_id || "").trim();
  const orgId = String(existing.organization_id || "");
  const dep = String(existing.departure_date || "").slice(0, 10);
  const retRaw = String(existing.return_date || "").trim();
  const endDate = (retRaw ? retRaw.slice(0, 10) : dep) || dep;
  const overrideReason = String((body as { overrideReason?: string }).overrideReason || "").trim();

  if (missionId) {
    const mFull = db
      .prepare("SELECT approval_status, lifecycle_status FROM missions WHERE id = ?")
      .get(missionId) as { approval_status: string; lifecycle_status: string } | undefined;
    if (!mFull) {
      return NextResponse.json({ error: "Linked mission not found." }, { status: 400 });
    }
    if (String(mFull.approval_status || "").toLowerCase() !== "approved") {
      return NextResponse.json({ error: "Mission must be approved before assigning a vehicle." }, { status: 400 });
    }
    if (String(mFull.lifecycle_status || "active").toLowerCase() !== "active") {
      return NextResponse.json({ error: "Mission is not active (deferred or cancelled)." }, { status: 400 });
    }
    const vStatus = String(vehicle.status || "");
    if (!vehicleStatusAllowedForReservation(vStatus, dep)) {
      return NextResponse.json(
        { error: `Vehicle ${vehicle.code} cannot be reserved for this departure date (status: ${vStatus}).` },
        { status: 400 }
      );
    }
    const m = db.prepare("SELECT required_vehicle_class FROM missions WHERE id = ?").get(missionId) as
      | { required_vehicle_class: string }
      | undefined;
    const reqClass = String(m?.required_vehicle_class || "").trim();
    const assetClass = String(vehicle.asset_class || "").trim();
    if (reqClass && assetClass && reqClass !== assetClass) {
      return NextResponse.json(
        { error: `Vehicle asset class (${assetClass}) does not match mission required class (${reqClass}).` },
        { status: 400 }
      );
    }
    const discBlockedMission = registrationDiscMissionBlocked(endDate, vehicle.registration_disc_expiry_date);
    let discOverrideUsedMission = false;
    if (discBlockedMission) {
      if (!registrationDiscOverrideAllowed(db, orgId, user.email, user.role, overrideReason)) {
        const discExpiry = String(vehicle.registration_disc_expiry_date || "").slice(0, 10);
        return NextResponse.json(
          {
            error: `Request runs until ${endDate} but ${vehicle.code}'s registration disc expires ${discExpiry}. A PR-credentialed approver or manager must supply overrideReason (8+ characters).`,
            reason: "registration_disc_exceeded",
            missionEnd: endDate,
            discExpiry,
          },
          { status: 400 }
        );
      }
      discOverrideUsedMission = true;
      recordMutation(db, {
        entityType: "mission",
        entityId: missionId,
        organizationId: orgId,
        action: "registration_disc_reservation_override",
        actor: actorFrom(user),
        after: {
          vehicleId: body.vehicleId,
          vehicleCode: vehicle.code,
          missionEnd: endDate,
          discExpiry: String(vehicle.registration_disc_expiry_date || "").slice(0, 10),
          via: "vehicle_request_assign",
        },
        reason: overrideReason,
      });
    }
    const conflicts = findActiveReservationConflicts(db, orgId, body.vehicleId, dep, endDate, missionId);
    if (conflicts.length > 0) {
      const canOverride = canOverrideReservationOverlap(user.role) && overrideReason.length >= 8;
      if (!canOverride) {
        return NextResponse.json(
          {
            error:
              "Overlapping reservation on this vehicle. Use POST /api/missions/{id}/reserve-vehicle with overrideReason, or ask a manager.",
            conflicts,
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
        after: { conflicts, overrideReason, via: "vehicle_request_assign" },
      });
    }
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
        body.vehicleId,
        missionId,
        dep,
        endDate,
        conflicts.length > 0 || discOverrideUsedMission ? overrideReason : "",
        conflicts.length > 0 || discOverrideUsedMission ? approverId : "",
        conflicts.length > 0 || discOverrideUsedMission ? approverName : "",
        now,
        now
      );
      db.prepare(
        `UPDATE missions SET assigned_vehicle_id = ?, assigned_at = ?, assigned_by_id = ?, assigned_by_name = ?,
         updated_at = ? WHERE id = ?`
      ).run(body.vehicleId, now, approverId, approverName, now, missionId);
    });
    tx();
  } else if (vehicle.status !== "operational") {
    return NextResponse.json({ error: `Vehicle ${vehicle.code} is not operational (status: ${vehicle.status})` }, { status: 400 });
  } else {
    const discBlockedLegacy = registrationDiscMissionBlocked(endDate, vehicle.registration_disc_expiry_date);
    if (discBlockedLegacy) {
      if (!registrationDiscOverrideAllowed(db, orgId, user.email, user.role, overrideReason)) {
        const discExpiry = String(vehicle.registration_disc_expiry_date || "").slice(0, 10);
        return NextResponse.json(
          {
            error: `Request runs until ${endDate} but ${vehicle.code}'s registration disc expires ${discExpiry}. A PR-credentialed approver or manager must supply overrideReason (8+ characters).`,
            reason: "registration_disc_exceeded",
            missionEnd: endDate,
            discExpiry,
          },
          { status: 400 }
        );
      }
      recordMutation(db, {
        entityType: "vehicle_request",
        entityId: id,
        organizationId: orgId,
        action: "registration_disc_assign_override",
        actor: actorFrom(user),
        after: {
          vehicleId: body.vehicleId,
          vehicleCode: vehicle.code,
          windowEnd: endDate,
          discExpiry: String(vehicle.registration_disc_expiry_date || "").slice(0, 10),
        },
        reason: overrideReason,
      });
    }
  }

  const oldStatus = existing.status as string;

  db.prepare(`
    UPDATE vehicle_requests
    SET assigned_vehicle_id = ?, status = 'assigned',
        approved_by_id = ?, approved_by_name = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    body.vehicleId,
    approverId,
    approverName,
    now,
    id
  );

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("vehicle_request", id, oldStatus, "assigned", approverName, now);

  recordMutation(db, {
    entityType: "vehicle_request",
    entityId: id,
    organizationId: orgId,
    action: "update",
    actor: actorFrom(user),
    before: {
      status: oldStatus,
      assigned_vehicle_id: existing.assigned_vehicle_id,
      mission_id: missionId || null,
    },
    after: {
      status: "assigned",
      assigned_vehicle_id: body.vehicleId,
      mission_id: missionId || null,
    },
  });

  await recalculateVehicleRequestFuel(db, id);

  const updated = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);

  return NextResponse.json(updated);
}
