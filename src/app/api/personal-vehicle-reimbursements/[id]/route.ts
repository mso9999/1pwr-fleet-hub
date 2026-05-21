import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { canApprovePvrClaim, pvrVehicleAvailabilityOverrideError } from "@/lib/pvr-approval-rules";

const PVR_PATCH_ROLES = new Set(["fleet_lead", "manager", "admin", "finance", "superadmin"]);

function pvrAuditRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    status: r.status,
    approved_by_id: r.approved_by_id,
    approved_by_name: r.approved_by_name,
    rejection_reason: r.rejection_reason,
    finance_reference: r.finance_reference,
    notes: r.notes,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM personal_vehicle_reimbursement_requests WHERE id = ?").get(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !PVR_PATCH_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: user ? 403 : 401 });
  }

  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT * FROM personal_vehicle_reimbursement_requests WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const beforeSnap = pvrAuditRow(existing);

  const allowed: Record<string, string> = {
    status: "status",
    approvedById: "approved_by_id",
    approvedByName: "approved_by_name",
    rejectionReason: "rejection_reason",
    financeReference: "finance_reference",
    notes: "notes",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowed)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (body.status === "approved" || body.status === "rejected") {
    fields.push("approved_at = ?");
    values.push(now);
  }

  if (fields.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const mergedStatus =
    body.status !== undefined ? String(body.status) : String(existing.status ?? "");
  const mergedNotes =
    body.notes !== undefined ? String(body.notes) : String(existing.notes ?? "");
  if (mergedStatus === "approved") {
    const snap = Number(existing.pool_operational_count_snapshot ?? 0);
    if (!canApprovePvrClaim(snap, mergedNotes)) {
      return NextResponse.json({ error: pvrVehicleAvailabilityOverrideError() }, { status: 400 });
    }
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE personal_vehicle_reimbursement_requests SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM personal_vehicle_reimbursement_requests WHERE id = ?").get(id) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "personal_vehicle_reimbursement_request",
    entityId: id,
    organizationId: String(existing.organization_id ?? ""),
    action: body.status === "approved" ? "approve" : body.status === "rejected" ? "reject" : "update",
    actor: auditActorFrom(user, {
      id: String(body.approvedById || ""),
      name: String(body.approvedByName || ""),
    }),
    before: beforeSnap,
    after: pvrAuditRow(updated),
  });

  return NextResponse.json(updated);
}
