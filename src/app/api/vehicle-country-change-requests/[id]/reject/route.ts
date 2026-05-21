import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isExecutiveRole, isFleetManagementRole } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const rejectionReason =
    typeof body.reason === "string" && body.reason.trim().length > 0 ? body.reason.trim() : "Rejected";

  const { id: requestId } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(requestId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = row.status as string;
  if (status !== "pending_fleet" && status !== "pending_executive") {
    return NextResponse.json({ error: "Request is not awaiting approval" }, { status: 400 });
  }

  const kind = row.change_kind as string;

  if (status === "pending_fleet") {
    if (kind !== "data_correction" || !isFleetManagementRole(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!isExecutiveRole(user.role)) {
    return NextResponse.json({ error: "C-level / executive role required to reject this transfer" }, { status: 403 });
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE vehicle_country_change_requests SET
      status = 'rejected',
      rejection_reason = ?,
      updated_at = ?,
      reviewed_by_id = ?,
      reviewed_by_name = ?,
      reviewed_at = ?
    WHERE id = ?`
  ).run(rejectionReason, now, user.id, user.name, now, requestId);

  const orgId = String(row.from_organization_id ?? row.to_organization_id ?? "");

  recordMutation(db, {
    entityType: "vehicle_country_change_request",
    entityId: requestId,
    organizationId: orgId,
    action: "reject",
    actor: actorFrom(user),
    before: {
      status: row.status,
      change_kind: row.change_kind,
      vehicle_id: row.vehicle_id,
    },
    after: { status: "rejected", rejectionReason },
  });

  const updated = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(requestId);
  return NextResponse.json(updated);
}
