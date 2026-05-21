import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { FIELD_ISSUE_CLOSEOUT_OUTCOME, FIELD_ISSUE_STATUS } from "@/types";

const OUTCOMES = new Set(Object.values(FIELD_ISSUE_CLOSEOUT_OUTCOME));
const TERMINAL = new Set(["closed", "dismissed"]);

function attachPhotos(db: ReturnType<typeof getDb>, reportId: string, row: Record<string, unknown>): Record<string, unknown> {
  const getMedia = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'field_report' AND entity_id = ? ORDER BY created_at ASC"
  );
  return { ...row, photos: getMedia.all(reportId) };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const db = getDb();
  const { id } = await params;
  const report = db
    .prepare(
      `SELECT r.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
       FROM field_issue_reports r
       JOIN vehicles v ON r.vehicle_id = v.id
       WHERE r.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  return NextResponse.json(attachPhotos(db, id, report));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  const db = getDb();
  const { id } = await params;

  const existing = db.prepare("SELECT * FROM field_issue_reports WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const prevStatus = String(existing.status || "");
  const prevClosed = String(existing.closed_at || "").trim();
  if (prevClosed || TERMINAL.has(prevStatus)) {
    return NextResponse.json({ error: "This ticket is already closed" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (status !== FIELD_ISSUE_STATUS.CLOSED && status !== FIELD_ISSUE_STATUS.DISMISSED) {
    return NextResponse.json({ error: "status must be \"closed\" or \"dismissed\" to close a ticket" }, { status: 400 });
  }

  const closeoutOutcome = typeof body.closeoutOutcome === "string" ? body.closeoutOutcome.trim() : "";
  if (!closeoutOutcome || !OUTCOMES.has(closeoutOutcome as (typeof FIELD_ISSUE_CLOSEOUT_OUTCOME)[keyof typeof FIELD_ISSUE_CLOSEOUT_OUTCOME])) {
    return NextResponse.json({ error: "closeoutOutcome is required and must be a valid outcome" }, { status: 400 });
  }

  const attendedByName = typeof body.attendedByName === "string" ? body.attendedByName.trim() : "";
  if (!attendedByName) {
    return NextResponse.json({ error: "attendedByName is required" }, { status: 400 });
  }

  const closedByName =
    typeof body.closedByName === "string" ? body.closedByName.trim() : "";
  if (!closedByName) {
    return NextResponse.json({ error: "closedByName is required" }, { status: 400 });
  }

  const closedById = typeof body.closedById === "string" ? body.closedById : "";
  const closeoutNotes = typeof body.closeoutNotes === "string" ? body.closeoutNotes : "";
  const now = new Date().toISOString();

  let workOrderId =
    (existing.work_order_id as string | null) ||
    (typeof body.workOrderId === "string" && body.workOrderId.trim() ? body.workOrderId.trim() : null);

  if (closeoutOutcome === FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_VIA_WO) {
    const wo = typeof body.workOrderId === "string" && body.workOrderId.trim() ? body.workOrderId.trim() : workOrderId;
    if (!wo) {
      return NextResponse.json(
        { error: "workOrderId is required when outcome is resolved_via_work_order" },
        { status: 400 }
      );
    }
    const found = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(wo) as { id: string } | undefined;
    if (!found) {
      return NextResponse.json({ error: "workOrderId does not match an existing work order" }, { status: 400 });
    }
    workOrderId = wo;
  } else if (typeof body.workOrderId === "string" && body.workOrderId.trim()) {
    const wo = body.workOrderId.trim();
    const found = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(wo) as { id: string } | undefined;
    if (!found) {
      return NextResponse.json({ error: "workOrderId does not match an existing work order" }, { status: 400 });
    }
    workOrderId = wo;
  }

  db.prepare(
    `UPDATE field_issue_reports SET
      status = ?,
      resolved_at = ?,
      closed_at = ?,
      closed_by_id = ?,
      closed_by_name = ?,
      attended_by_name = ?,
      closeout_outcome = ?,
      closeout_notes = ?,
      work_order_id = ?
    WHERE id = ?`
  ).run(
    status,
    now,
    now,
    closedById,
    closedByName,
    attendedByName,
    closeoutOutcome,
    closeoutNotes,
    workOrderId,
    id
  );

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("field_report", id, prevStatus, status, closedByName, now);

  recordMutation(db, {
    entityType: "field_report",
    entityId: id,
    organizationId: String(existing.organization_id ?? ""),
    action: "update",
    actor: auditActorFrom(user, { id: closedById, name: closedByName }),
    before: { status: prevStatus, work_order_id: existing.work_order_id },
    after: {
      status,
      closeoutOutcome,
      workOrderId: workOrderId,
      attendedByName,
    },
  });

  const report = db
    .prepare(
      `SELECT r.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
       FROM field_issue_reports r
       JOIN vehicles v ON r.vehicle_id = v.id
       WHERE r.id = ?`
    )
    .get(id) as Record<string, unknown>;

  return NextResponse.json(attachPhotos(db, id, report));
}
