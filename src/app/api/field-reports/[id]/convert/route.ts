import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const report = db.prepare(
    "SELECT * FROM field_issue_reports WHERE id = ?"
  ).get(id) as Record<string, unknown> | undefined;

  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.work_order_id) {
    return NextResponse.json({ error: "Already converted to work order", workOrderId: report.work_order_id }, { status: 400 });
  }

  const body = await request.json();
  const now = new Date().toISOString();
  const woId = uuidv4();

  const severityToPriority: Record<string, string> = {
    critical: "critical",
    high: "high",
    medium: "medium",
    low: "low",
  };

  db.prepare(`
    INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, assigned_to, repair_location, reported_by, remarks, downtime_start, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    woId,
    report.organization_id,
    report.vehicle_id,
    report.title,
    `${report.description}\n\nField report from ${report.reported_by_name} at ${report.location}. ${report.is_driveable ? "Vehicle is driveable." : "Vehicle is NOT driveable."}`,
    "corrective",
    severityToPriority[report.severity as string] || "medium",
    "submitted",
    body.assignedTo || "",
    body.repairLocation || "hq",
    report.reported_by_name,
    `Auto-created from field report #${id.slice(0, 8)}`,
    now,
    now,
    now
  );

  // Record initial status history
  db.prepare(
    "INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by_name, reason, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(woId, null, "submitted", "system", `Created from field report by ${report.reported_by_name}`, now);

  // Copy field report photos to work order
  const photos = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'field_report' AND entity_id = ?"
  ).all(id) as Array<Record<string, unknown>>;

  for (const photo of photos) {
    const mediaId = uuidv4();
    db.prepare(`
      INSERT INTO media_attachments (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, caption, category, uploaded_by_id, uploaded_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mediaId, "work_order", woId, photo.file_name, photo.original_name, photo.mime_type, photo.size_bytes, "From field report", "damage", photo.uploaded_by_id, photo.uploaded_by_name);
  }

  // Update field report
  db.prepare(
    "UPDATE field_issue_reports SET status = 'converted', work_order_id = ? WHERE id = ?"
  ).run(woId, id);

  return NextResponse.json({ workOrderId: woId, reportId: id, status: "converted" });
}
