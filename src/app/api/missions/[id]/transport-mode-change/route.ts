import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canApproveMissionRequests } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

const VALID_MODES = new Set(["public_transport", "third_party", "personal_vehicle"]);

/**
 * POST /api/missions/[id]/transport-mode-change
 *
 * Request a day-of transport-mode switch on an approved mission (e.g. when no
 * vehicle is available or the reserved vehicle is in repairs). The request is
 * recorded with status 'pending' for management approval. On approval, the
 * mission's transport_mode is updated so the trip can be lodged against the
 * appropriate sentinel vehicle.
 *
 * Body actions:
 *   - { action: "request", requestedMode, reason }
 *   - { action: "approve" | "reject", requestId, reviewReason? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: missionId } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action || "request").toLowerCase();
  const db = getDb();

  const mission = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as Record<string, unknown> | undefined;
  if (!mission) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }
  const orgId = String(mission.organization_id ?? "");

  if (action === "request") {
    const requestedMode = String(body.requestedMode || "").toLowerCase();
    if (!VALID_MODES.has(requestedMode)) {
      return NextResponse.json(
        { error: "requestedMode must be one of: public_transport, third_party, personal_vehicle." },
        { status: 400 }
      );
    }
    const reason = String(body.reason || "").trim();
    if (reason.length < 20) {
      return NextResponse.json(
        { error: "Provide a reason of at least 20 characters (e.g. 'no vehicles available for this date; reserved vehicle in repairs')." },
        { status: 400 }
      );
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO transport_mode_change_requests
       (id, mission_id, organization_id, requested_mode, reason, status,
        requested_by_id, requested_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    ).run(id, missionId, orgId, requestedMode, reason, user.id, user.name || user.email, now, now);
    recordMutation(db, {
      entityType: "mission",
      entityId: missionId,
      organizationId: orgId,
      action: "update",
      actor: actorFrom(user),
      after: { transportModeChangeRequest: { id, requestedMode, reason } },
    });
    return NextResponse.json({ id, status: "pending" }, { status: 201 });
  }

  if (action === "approve" || action === "reject") {
    const requestId = String(body.requestId || "").trim();
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }
    if (!(await canApproveMissionRequests(db, orgId, user.email, user.role))) {
      return NextResponse.json(
        { error: "Only management approvers may approve or reject transport-mode change requests." },
        { status: 403 }
      );
    }
    const req = db
      .prepare("SELECT * FROM transport_mode_change_requests WHERE id = ? AND mission_id = ?")
      .get(requestId, missionId) as Record<string, unknown> | undefined;
    if (!req) {
      return NextResponse.json({ error: "Change request not found for this mission." }, { status: 404 });
    }
    if (String(req.status || "").toLowerCase() !== "pending") {
      return NextResponse.json({ error: `Request already ${req.status}.` }, { status: 409 });
    }
    const reviewReason = String(body.reviewReason || "").trim();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE transport_mode_change_requests
         SET status = ?, reviewed_by_id = ?, reviewed_by_name = ?, reviewed_at = ?,
             review_reason = ?, updated_at = ?
         WHERE id = ?`
      ).run(action === "approve" ? "approved" : "rejected", user.id, user.name || user.email, now, reviewReason, now, requestId);
      if (action === "approve") {
        // Apply the approved mode to the mission. Clear required_vehicle_class
        // since there's no company vehicle. Keep the justification on file
        // from the request reason.
        db.prepare(
          `UPDATE missions
           SET transport_mode = ?, required_vehicle_class = '',
               public_transport_justification = COALESCE(NULLIF(public_transport_justification, ''), ?),
               updated_at = ?
           WHERE id = ?`
        ).run(String(req.requested_mode), String(req.reason), now, missionId);
      }
    });
    tx();
    recordMutation(db, {
      entityType: "mission",
      entityId: missionId,
      organizationId: orgId,
      action: action === "approve" ? "approve" : "reject",
      actor: actorFrom(user),
      after: { transportModeChangeRequest: { id: requestId, status: action === "approve" ? "approved" : "rejected", mode: req.requested_mode } },
      reason: reviewReason,
    });
    return NextResponse.json({ id: requestId, status: action === "approve" ? "approved" : "rejected" });
  }

  return NextResponse.json({ error: "Unknown action. Use 'request', 'approve', or 'reject'." }, { status: 400 });
}

/** GET /api/missions/[id]/transport-mode-change — list change requests for a mission. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: missionId } = await params;
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM transport_mode_change_requests WHERE mission_id = ? ORDER BY datetime(created_at) DESC")
    .all(missionId);
  return NextResponse.json({ requests: rows });
}
