import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { actorFrom, recordMutation } from "@/lib/record-mutation-log";

export const runtime = "nodejs";

function toIso(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return new Date().toISOString();
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function hasFirstDecision(row: Record<string, unknown>): boolean {
  const approval = String(row.approval_status || "").toLowerCase();
  return approval === "approved" || approval === "rejected";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const incomingSourceAt = toIso(body.sourceUpdatedAt);
  const existingSourceAt = toIso(row.hr_source_updated_at);
  if (hasFirstDecision(row) && incomingSourceAt > existingSourceAt) {
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: String(row.organization_id || ""),
      action: "sync_conflict",
      actor: actorFrom({ id: "integration", name: "HR integration" }),
      before: {
        approval_status: row.approval_status,
        hr_source_updated_at: row.hr_source_updated_at,
      },
      after: {
        attempted_action: body.action,
        attempted_source_updated_at: incomingSourceAt,
      },
      reason: "first_writer_wins",
    });
    return NextResponse.json(
      {
        error: "Conflict: mission decision already finalized",
        approval_status: row.approval_status,
        hr_source_updated_at: row.hr_source_updated_at,
      },
      { status: 409 }
    );
  }

  const action = String(body.action || "").toLowerCase();
  const now = new Date().toISOString();
  const syncSource = String(body.syncSource || "hr_portal");
  const reason = String(body.reason || body.rejectionReason || body.revisionReason || "").trim();

  let approvalStatus = String(row.approval_status || "pending");
  if (action === "approve") {
    approvalStatus = "approved";
  } else if (action === "reject") {
    approvalStatus = "rejected";
  } else if (action === "revise") {
    approvalStatus = "revision_requested";
  } else if (action === "resubmit") {
    approvalStatus = "pending";
  } else if (body.hrRequestStatus) {
    const status = String(body.hrRequestStatus).toLowerCase();
    if (status === "approved") approvalStatus = "approved";
    else if (status === "rejected") approvalStatus = "rejected";
    else if (status === "revise and resubmit") approvalStatus = "revision_requested";
    else if (status === "resubmitted" || status === "submitted") approvalStatus = "pending";
  }

  db.prepare(
    `UPDATE missions
     SET approval_status = ?,
         rejection_reason = ?,
         approved_at = CASE WHEN ? = 'approved' OR ? = 'rejected' THEN ? ELSE approved_at END,
         approved_by_id = CASE WHEN ? = 'approved' OR ? = 'rejected' THEN 'integration' ELSE approved_by_id END,
         approved_by_name = CASE WHEN ? = 'approved' OR ? = 'rejected' THEN 'HR integration' ELSE approved_by_name END,
         approval_source = ?,
         hr_request_status = ?,
         hr_sync_source = ?,
         hr_source_updated_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    approvalStatus,
    reason,
    approvalStatus,
    approvalStatus,
    now,
    approvalStatus,
    approvalStatus,
    approvalStatus,
    approvalStatus,
    syncSource,
    String(body.hrRequestStatus || ""),
    syncSource,
    incomingSourceAt,
    now,
    id
  );

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
  recordMutation(db, {
    entityType: "mission",
    entityId: id,
    organizationId: String(row.organization_id || ""),
    action: "status_sync",
    actor: actorFrom({ id: "integration", name: "HR integration" }),
    before: {
      approval_status: row.approval_status,
      hr_source_updated_at: row.hr_source_updated_at,
    },
    after: {
      approval_status: updated.approval_status,
      approval_source: updated.approval_source,
      hr_source_updated_at: updated.hr_source_updated_at,
    },
    reason: action || "hr_status_sync",
  });

  return NextResponse.json(updated);
}

