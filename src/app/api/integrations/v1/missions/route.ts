import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { insertPlannedMission } from "@/lib/missions";
import { actorFrom, recordMutation } from "@/lib/record-mutation-log";

export const runtime = "nodejs";

/**
 * Fleet integration endpoint for HR-created per diem / deployment missions.
 * Auth: X-Fleet-Integration-Key.
 */
export function GET(request: NextRequest): NextResponse {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const hrRequestId = request.nextUrl.searchParams.get("hrRequestId");
  const approvalStatus = request.nextUrl.searchParams.get("approvalStatus");

  let sql = `SELECT * FROM missions WHERE organization_id = ?`;
  const params: string[] = [org];
  if (hrRequestId) {
    sql += " AND hr_request_id = ?";
    params.push(hrRequestId);
  }
  if (approvalStatus && approvalStatus !== "all") {
    sql += " AND lower(COALESCE(approval_status,'')) = lower(?)";
    params.push(approvalStatus);
  }
  sql += " ORDER BY created_at DESC LIMIT 200";

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const organizationId = String(body.organizationId || "1pwr_lesotho");
  const hrRequestId = String(body.hrRequestId || "").trim();
  if (!hrRequestId) {
    return NextResponse.json({ error: "hrRequestId is required" }, { status: 422 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM missions WHERE hr_request_id = ? LIMIT 1").get(hrRequestId) as
    | Record<string, unknown>
    | undefined;
  if (existing) {
    return NextResponse.json(existing);
  }

  const id = insertPlannedMission(db, {
    organizationId,
    title: String(body.title || `Per diem ${hrRequestId}`),
    destination: String(body.destination || ""),
    departureDate: String(body.departureDate || ""),
    returnDate: String(body.returnDate || ""),
    missionType: String(body.missionType || "per_diem"),
    passengers: String(body.passengers || ""),
    loadoutSummary: String(body.loadoutSummary || ""),
    notes: String(body.notes || ""),
    createdById: "integration",
    createdByName: "HR integration",
    missionProfile: String(body.missionProfile || "local"),
    requiredVehicleClass: String(body.requiredVehicleClass || ""),
    rrStatus: String(body.rrStatus || "na"),
    hrRequestId,
    hrRequestStatus: String(body.hrRequestStatus || "submitted"),
    hrSyncSource: String(body.syncSource || "hr_portal"),
    hrSourceUpdatedAt: String(body.sourceUpdatedAt || new Date().toISOString()),
  });

  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
  recordMutation(db, {
    entityType: "mission",
    entityId: id,
    organizationId,
    action: "create",
    actor: actorFrom({ id: "integration", name: "HR integration" }),
    after: {
      hr_request_id: row.hr_request_id,
      title: row.title,
      destination: row.destination,
      approval_status: row.approval_status,
    },
    reason: "created_from_hr_per_diem",
  });

  return NextResponse.json(row, { status: 201 });
}

