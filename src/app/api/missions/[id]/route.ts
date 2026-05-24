import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canApproveMissionRequests,
  canArbitrateMissionCapacity,
  canFullyManageVehicleRequests,
} from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

const MATERIAL_FIELD_PAIRS: ReadonlyArray<[keyof Record<string, unknown>, string]> = [
  ["departure_date", "departureDate"],
  ["return_date", "returnDate"],
  ["destination", "destination"],
  ["mission_profile", "missionProfile"],
  ["required_vehicle_class", "requiredVehicleClass"],
  ["mission_type", "missionType"],
  ["passengers", "passengers"],
  ["loadout_summary", "loadoutSummary"],
];

function missionAuditSubset(r: Record<string, unknown>): Record<string, unknown> {
  return {
    title: r.title,
    destination: r.destination,
    departure_date: r.departure_date,
    return_date: r.return_date,
    approval_status: r.approval_status,
    lifecycle_status: r.lifecycle_status,
    mission_profile: r.mission_profile,
    status: r.status,
    required_vehicle_class: r.required_vehicle_class,
  };
}

function materialMissionFieldsChanged(
  before: Record<string, unknown>,
  body: Record<string, unknown>
): boolean {
  for (const [dbKey, jsKey] of MATERIAL_FIELD_PAIRS) {
    if (body[jsKey] === undefined) continue;
    const oldV = String(before[dbKey] ?? "").trim();
    const newV = String(body[jsKey] ?? "").trim();
    if (oldV !== newV) return true;
  }
  return false;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * PATCH /api/missions/[id]
 * - action approve | reject | revise (approvers)
 * - action resubmit (mission creator after revision feedback)
 * - action defer | cancel_capacity | reactivate (management arbitration — fleet_lead excluded)
 * - field updates (creator when pending, or fleet management; material edits on approved mission reopen approval)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orgId = String(row.organization_id ?? "");
  const action = String(body.action || "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "approve" || action === "reject" || action === "revise") {
    if (!canApproveMissionRequests(db, orgId, user.email, user.role)) {
      return NextResponse.json(
        { error: "Only PR-credentialed approvers or fleet management can approve missions." },
        { status: 403 }
      );
    }
    const beforeSnap = missionAuditSubset(row);
    if (action === "approve") {
      db.prepare(
        `UPDATE missions SET approval_status = 'approved', approved_by_id = ?, approved_by_name = ?,
         approved_at = ?, rejection_reason = '', lifecycle_status = 'active', updated_at = ? WHERE id = ?`
      ).run(user.id, user.name || user.email, now, now, id);
    } else if (action === "reject") {
      const reason = String(body.rejectionReason || "").trim() || "Rejected";
      db.prepare(
        `UPDATE missions SET approval_status = 'rejected', approved_by_id = ?, approved_by_name = ?,
         approved_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`
      ).run(user.id, user.name || user.email, now, reason, now, id);
    } else {
      const reason = String(body.revisionReason || "").trim();
      if (reason.length < 8) {
        return NextResponse.json(
          { error: "Provide clear revision feedback (at least 8 characters)." },
          { status: 400 }
        );
      }
      db.prepare(
        `UPDATE missions SET approval_status = 'revision_requested', approved_by_id = ?, approved_by_name = ?,
         approved_at = ?, rejection_reason = ?, lifecycle_status = 'active', updated_at = ? WHERE id = ?`
      ).run(user.id, user.name || user.email, now, reason, now, id);
    }
    const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: orgId,
      action: action === "approve" ? "approve" : action === "reject" ? "reject" : "update",
      actor: actorFrom(user),
      before: beforeSnap,
      after: missionAuditSubset(updated),
      reason:
        action === "reject"
          ? String(body.rejectionReason || "").trim()
          : action === "revise"
            ? String(body.revisionReason || "").trim()
            : "",
    });
    return NextResponse.json(updated);
  }

  if (action === "resubmit") {
    const isCreator = String(row.created_by_id || "") === user.id;
    const currentApproval = String(row.approval_status || "").toLowerCase();
    if (!isCreator && user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Only the mission requestor may resubmit for approval." },
        { status: 403 }
      );
    }
    if (currentApproval !== "revision_requested") {
      return NextResponse.json(
        { error: "Only missions marked 'revision requested' can be resubmitted." },
        { status: 400 }
      );
    }
    const beforeSnap = missionAuditSubset(row);
    db.prepare(
      `UPDATE missions SET approval_status = 'pending', approved_by_id = '', approved_by_name = '',
       approved_at = NULL, rejection_reason = '', updated_at = ? WHERE id = ?`
    ).run(now, id);
    const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: orgId,
      action: "update",
      actor: actorFrom(user),
      before: beforeSnap,
      after: missionAuditSubset(updated),
      reason: "resubmitted_for_approval",
    });
    return NextResponse.json(updated);
  }

  if (action === "defer" || action === "cancel_capacity" || action === "reactivate") {
    if (!canArbitrateMissionCapacity(db, orgId, user.email, user.role)) {
      return NextResponse.json(
        { error: "Only management (not fleet lead alone) may defer or cancel missions for capacity." },
        { status: 403 }
      );
    }
    const reason = String(body.reason || "").trim();
    if (reason.length < 4) {
      return NextResponse.json({ error: "Provide a reason (at least 4 characters)." }, { status: 400 });
    }
    if (action === "defer") {
      db.prepare(
        `UPDATE missions SET lifecycle_status = 'deferred', rejection_reason = ?, updated_at = ? WHERE id = ?`
      ).run(reason, now, id);
    } else if (action === "cancel_capacity") {
      db.prepare(
        `UPDATE missions SET lifecycle_status = 'capacity_cancelled', rejection_reason = ?, updated_at = ? WHERE id = ?`
      ).run(reason, now, id);
    } else {
      db.prepare(
        `UPDATE missions SET lifecycle_status = 'active', updated_at = ? WHERE id = ?`
      ).run(now, id);
    }
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: orgId,
      action: "mission_lifecycle",
      actor: actorFrom(user),
      after: { subAction: action, reason },
    });
    const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
    return NextResponse.json(updated);
  }

  // Field updates
  const isCreator = String(row.created_by_id || "") === user.id;
  const wasApproved = String(row.approval_status || "").toLowerCase() === "approved";
  const canManage = canFullyManageVehicleRequests(user.role);
  const pending = String(row.approval_status || "").toLowerCase() === "pending";

  if (!isCreator && !canManage && user.role !== "superadmin") {
    return NextResponse.json({ error: "Not allowed to edit this mission." }, { status: 403 });
  }
  if (!canManage && user.role !== "superadmin" && wasApproved) {
    return NextResponse.json(
      { error: "Only fleet management can edit an already-approved mission; use a change request or ask a manager." },
      { status: 403 }
    );
  }

  const material = materialMissionFieldsChanged(row, body as Record<string, unknown>);
  const fields: string[] = [];
  const values: unknown[] = [];

  const map: Record<string, string> = {
    title: "title",
    destination: "destination",
    departureDate: "departure_date",
    returnDate: "return_date",
    missionType: "mission_type",
    passengers: "passengers",
    loadoutSummary: "loadout_summary",
    notes: "notes",
    missionProfile: "mission_profile",
    requiredVehicleClass: "required_vehicle_class",
    rrStatus: "rr_status",
  };

  for (const [js, col] of Object.entries(map)) {
    if (body[js] !== undefined) {
      fields.push(`${col} = ?`);
      let v = body[js];
      if (js === "missionProfile") {
        v = String(v).toLowerCase() === "field" ? "field" : "local";
      }
      if (js === "rrStatus") {
        const r = String(v).toLowerCase();
        v = r === "pending" || r === "approved" ? r : "na";
      }
      values.push(v);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No updatable fields supplied." }, { status: 400 });
  }

  if (wasApproved && material) {
    fields.push("approval_status = ?", "approved_at = NULL", "approved_by_id = ?", "approved_by_name = ?");
    values.push("pending", "", "");
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE missions SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (wasApproved && material) {
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: orgId,
      action: "mission_reopened_approval",
      actor: actorFrom(user),
      after: { materialFields: true },
    });
  }

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
  recordMutation(db, {
    entityType: "mission",
    entityId: id,
    organizationId: orgId,
    action: "update",
    actor: actorFrom(user),
    before: missionAuditSubset(row),
    after: missionAuditSubset(updated),
  });

  return NextResponse.json(updated);
}
