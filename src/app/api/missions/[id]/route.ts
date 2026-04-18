import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canApproveMissionRequests } from "@/lib/vehicle-check-approvers";

/**
 * PATCH /api/missions/[id] — PR-credentialed approvers approve or reject a mission (trip plan).
 * Body: { action: "approve" | "reject", rejectionReason?: string }
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
  const action = String(body.action || "").toLowerCase();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orgId = String(row.organization_id ?? "");
  if (!canApproveMissionRequests(db, orgId, user.email, user.role)) {
    return NextResponse.json(
      { error: "Only PR-credentialed approvers or fleet management can approve missions." },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  if (action === "approve") {
    db.prepare(
      `UPDATE missions SET approval_status = 'approved', approved_by_id = ?, approved_by_name = ?,
         approved_at = ?, rejection_reason = '', updated_at = ? WHERE id = ?`
    ).run(user.id, user.name || user.email, now, now, id);
  } else {
    const reason = String(body.rejectionReason || "").trim() || "Rejected";
    db.prepare(
      `UPDATE missions SET approval_status = 'rejected', approved_by_id = ?, approved_by_name = ?,
         approved_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`
    ).run(user.id, user.name || user.email, now, reason, now, id);
  }

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  return NextResponse.json(updated);
}
