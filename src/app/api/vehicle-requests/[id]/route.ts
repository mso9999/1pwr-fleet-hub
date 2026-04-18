import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canApproveMissionRequests,
  canFullyManageVehicleRequests,
} from "@/lib/vehicle-check-approvers";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import { VR_SELECT_FIELDS, VR_FROM_JOIN } from "@/lib/vehicle-request-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
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

  const existing = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.rrStatus !== undefined) {
    const rr = String(body.rrStatus).toLowerCase();
    if (!["na", "pending", "approved"].includes(rr)) {
      return NextResponse.json({ error: "rrStatus must be na, pending, or approved" }, { status: 400 });
    }
    body.rrStatus = rr;
  }

  const allowedKeys = (Object.keys(body) as string[]).filter(
    (k) =>
      [
        "status",
        "approvedById",
        "approvedByName",
        "rejectionReason",
        "assignedVehicleId",
        "notes",
        "purpose",
        "destination",
        "departureDate",
        "returnDate",
        "passengers",
        "requiredVehicleClass",
        "loadoutDescription",
        "priority",
        "rrStatus",
      ].includes(k) && body[k as keyof typeof body] !== undefined
  );

  if (allowedKeys.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const canFull = canFullyManageVehicleRequests(user.role);
  const orgId = String((existing as Record<string, unknown>).organization_id || "");
  const canMission = canApproveMissionRequests(db, orgId, user.email, user.role);
  const isRequestor = String((existing as Record<string, unknown>).requested_by_id || "") === user.id;
  const onlyRr = allowedKeys.length === 1 && allowedKeys[0] === "rrStatus";

  if (onlyRr) {
    if (!canFull && !isRequestor) {
      return NextResponse.json({ error: "Not allowed to edit R&R on this request" }, { status: 403 });
    }
    if (!canFull && isRequestor && String(body.rrStatus).toLowerCase() === "approved") {
      return NextResponse.json(
        { error: "Only fleet management can set R&R to Approved" },
        { status: 403 }
      );
    }
  } else {
    const keysForAuth = allowedKeys.filter(
      (k) => k !== "approvedById" && k !== "approvedByName"
    );
    const missionOnly =
      keysForAuth.length > 0 &&
      keysForAuth.every((k) => k === "status" || k === "rejectionReason");
    if (missionOnly) {
      if (!canMission) {
        return NextResponse.json(
          { error: "Not allowed to approve or reject this request" },
          { status: 403 }
        );
      }
    } else if (!canFull) {
      return NextResponse.json({ error: "Only fleet management can edit this request" }, { status: 403 });
    }
  }

  const existingStatus = (existing as Record<string, unknown>).status as string;
  if (
    user &&
    body.status !== undefined &&
    body.status !== existingStatus &&
    ["approved", "rejected", "assigned"].includes(String(body.status))
  ) {
    body.approvedById = user.id;
    body.approvedByName = user.name || user.email;
  }

  const allowed: Record<string, string> = {
    status: "status",
    approvedById: "approved_by_id",
    approvedByName: "approved_by_name",
    rejectionReason: "rejection_reason",
    assignedVehicleId: "assigned_vehicle_id",
    notes: "notes",
    purpose: "purpose",
    destination: "destination",
    departureDate: "departure_date",
    returnDate: "return_date",
    passengers: "passengers",
    requiredVehicleClass: "required_vehicle_class",
    loadoutDescription: "loadout_description",
    priority: "priority",
    rrStatus: "rr_status",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowed)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE vehicle_requests SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (
    body.destination !== undefined ||
    body.assignedVehicleId !== undefined ||
    (body.status !== undefined && String(body.status) === "assigned")
  ) {
    await recalculateVehicleRequestFuel(db, id);
  }

  if (body.status && body.status !== (existing as Record<string, unknown>).status) {
    const actor =
      user?.name || user?.email || String(body.approvedByName || body.changedBy || "");
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("vehicle_request", id, (existing as Record<string, unknown>).status, body.status, actor, now);
  }

  const updated = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare("DELETE FROM vehicle_requests WHERE id = ?").run(id);
  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
