import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canApproveMissionRequests,
  canArbitrateMissionCapacity,
} from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { isMultiStopRolloutEnabledServer } from "@/lib/feature-flags";
import { canEditPrivateDraft, canViewPrivateDraft } from "@/lib/fleet-roles";
import {
  normalizeRouteStops,
  normalizeTripShape,
  routeStopsEqual,
  validateRoutePlan,
} from "@/lib/trip-route";

const MATERIAL_FIELD_PAIRS: ReadonlyArray<[keyof Record<string, unknown>, string]> = [
  ["departure_date", "departureDate"],
  ["return_date", "returnDate"],
  ["destination", "destination"],
  ["mission_profile", "missionProfile"],
  ["trip_shape", "tripShape"],
  ["required_vehicle_class", "requiredVehicleClass"],
  ["mission_type", "missionType"],
  ["passengers", "passengers"],
  ["crew_size", "crewSize"],
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
    trip_shape: r.trip_shape,
    status: r.status,
    required_vehicle_class: r.required_vehicle_class,
  };
}

type DbMissionStop = {
  id: string;
  mission_id: string;
  stop_order: number;
  location: string;
  load_out: string;
  load_in: string;
  notes: string;
};

function getMissionStops(db: ReturnType<typeof getDb>, missionId: string): DbMissionStop[] {
  return db
    .prepare(
      `SELECT id, mission_id, stop_order, location, load_out, load_in, notes
       FROM mission_stops
       WHERE mission_id = ?
       ORDER BY stop_order`
    )
    .all(missionId) as DbMissionStop[];
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

function mapMissionApprovalToHrStatus(approvalStatus: string): string {
  const normalized = approvalStatus.toLowerCase();
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "revision_requested") return "Revise and Resubmit";
  if (normalized === "pending") return "Resubmitted";
  return "Submitted";
}

async function syncMissionDecisionToHr(args: {
  hrRequestId: string;
  status: string;
  remarks?: string;
  actionAtIso: string;
  missionId: string;
}): Promise<void> {
  const base = (process.env.HR_API_BASE_URL || "").replace(/\/$/, "");
  const key = process.env.HR_API_KEY || "";
  if (!base || !key || !args.hrRequestId) {
    return;
  }
  const endpoint = `${base}/api/per-diem/requests/${encodeURIComponent(args.hrRequestId)}/status-sync`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": key,
    },
    body: JSON.stringify({
      status: args.status,
      remarks: args.remarks || "",
      action_at: args.actionAtIso,
      source: "fleet_hub",
      fleet_mission_id: args.missionId,
    }),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    console.error("[api/missions PATCH] failed to sync decision to HR", {
      hrRequestId: args.hrRequestId,
      status: args.status,
      httpStatus: res.status,
      body: text.slice(0, 300),
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getVerifiedFleetUser(request);
  const approval = String((row as Record<string, unknown>).approval_status || "").toLowerCase();
  if (approval === "draft") {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const canView = canViewPrivateDraft({
      role: user.role,
      department: user.department,
      isCreator: String((row as Record<string, unknown>).created_by_id || "") === user.id,
    });
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const stops = getMissionStops(db, id);
  return NextResponse.json({ ...(row as Record<string, unknown>), stops, stop_count: stops.length });
}

/**
 * PATCH /api/missions/[id]
 * - action approve | reject | revise (approvers)
 * - action submit (draft -> pending)
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
  const rollout = isMultiStopRolloutEnabledServer();
  const existingStops = getMissionStops(db, id);

  if (action === "approve" || action === "reject" || action === "revise") {
    if (!(await canApproveMissionRequests(db, orgId, user.email, user.role))) {
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
    const hrRequestId = String(updated.hr_request_id || "").trim();
    if (hrRequestId) {
      await syncMissionDecisionToHr({
        hrRequestId,
        missionId: id,
        status: mapMissionApprovalToHrStatus(String(updated.approval_status || "")),
        remarks:
          action === "reject"
            ? String(body.rejectionReason || "").trim()
            : action === "revise"
              ? String(body.revisionReason || "").trim()
              : "",
        actionAtIso: now,
      });
    }
    return NextResponse.json(updated);
  }

  if (action === "submit") {
    const currentApproval = String(row.approval_status || "").toLowerCase();
    if (currentApproval !== "draft") {
      return NextResponse.json({ error: "Only draft missions can be submitted." }, { status: 400 });
    }
    const canSubmit = canEditPrivateDraft({
      role: user.role,
      department: user.department,
      isCreator: String(row.created_by_id || "") === user.id,
    });
    if (!canSubmit && user.role !== "superadmin") {
      return NextResponse.json({ error: "Not allowed to submit this draft mission." }, { status: 403 });
    }
    const beforeSnap = missionAuditSubset(row);
    db.prepare(
      `UPDATE missions
       SET approval_status = 'pending', approved_by_id = '', approved_by_name = '',
           approved_at = NULL, rejection_reason = '', updated_at = ?
       WHERE id = ?`
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
      reason: "draft_submitted_for_approval",
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
    const hrRequestId = String(updated.hr_request_id || "").trim();
    if (hrRequestId) {
      await syncMissionDecisionToHr({
        hrRequestId,
        missionId: id,
        status: "Resubmitted",
        remarks: "resubmitted_for_approval",
        actionAtIso: now,
      });
    }
    return NextResponse.json(updated);
  }

  if (action === "defer" || action === "cancel_capacity" || action === "reactivate") {
    if (!(await canArbitrateMissionCapacity(db, orgId, user.email, user.role))) {
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
  const canDraftEdit = canEditPrivateDraft({
    role: user.role,
    department: user.department,
    isCreator,
  });
  const currentApproval = String(row.approval_status || "").toLowerCase();
  if (currentApproval !== "draft") {
    return NextResponse.json(
      { error: "Only draft missions can be edited. Submit a draft first, then follow approval actions." },
      { status: 400 }
    );
  }
  const wasApproved = String(row.approval_status || "").toLowerCase() === "approved";

  if (!canDraftEdit) {
    return NextResponse.json({ error: "Not allowed to edit this mission." }, { status: 403 });
  }
  const material = materialMissionFieldsChanged(row, body as Record<string, unknown>);
  const incomingStops =
    rollout && body.stops !== undefined ? normalizeRouteStops(body.stops) : null;
  const existingStopShape = existingStops.map((s) => ({
    location: String(s.location || "").trim(),
    loadOut: String(s.load_out || "").trim(),
    loadIn: String(s.load_in || "").trim(),
    notes: String(s.notes || "").trim(),
  }));
  const stopPlanChanged =
    incomingStops !== null &&
    !routeStopsEqual(existingStopShape, incomingStops);
  const fields: string[] = [];
  const values: unknown[] = [];

  const map: Record<string, string> = {
    title: "title",
    destination: "destination",
    departureDate: "departure_date",
    returnDate: "return_date",
    missionType: "mission_type",
    passengers: "passengers",
    crewSize: "crew_size",
    personnelManifest: "personnel_manifest",
    loadoutSummary: "loadout_summary",
    notes: "notes",
    missionProfile: "mission_profile",
    tripShape: "trip_shape",
    requiredVehicleClass: "required_vehicle_class",
    rrStatus: "rr_status",
    transportMode: "transport_mode",
    publicTransportJustification: "public_transport_justification",
  };

  for (const [js, col] of Object.entries(map)) {
    if (body[js] !== undefined) {
      let v = body[js];
      if (js === "missionProfile") {
        v = String(v).toLowerCase() === "field" ? "field" : "local";
      }
      if (js === "tripShape") {
        if (!rollout) continue;
        v = normalizeTripShape(v);
      }
      if (js === "rrStatus") {
        const r = String(v).toLowerCase();
        v = r === "pending" || r === "approved" ? r : "na";
      }
      if (js === "transportMode") {
        const raw = String(v ?? "company_vehicle").toLowerCase();
        v = raw === "public_transport" ? "public_transport" : "company_vehicle";
        // If switching to public_transport, clear required_vehicle_class.
        // Justification must be present (validated below).
        if (v === "public_transport") {
          const existingJust = String(
            (row as Record<string, unknown>)?.public_transport_justification ?? "",
          ).trim();
          const incomingJust = String(body.publicTransportJustification ?? "").trim();
          if (existingJust.length < 20 && incomingJust.length < 20) {
            return NextResponse.json(
              {
                error:
                  "Public-transport missions require a justification of at least 20 characters.",
                field: "publicTransportJustification",
              },
              { status: 400 },
            );
          }
          // Force required_vehicle_class to '' in the same PATCH.
          fields.push("required_vehicle_class = ?");
          values.push("");
        }
      }
      if (js === "publicTransportJustification") {
        v = String(v ?? "").trim().slice(0, 1000);
      }
      if (js === "crewSize") {
        const n = parseInt(String(v ?? ""), 10);
        if (!Number.isFinite(n) || n < 1) {
          return NextResponse.json(
            { error: "Crew size must be a whole number of at least 1." },
            { status: 400 }
          );
        }
        v = n;
      }
      if (js === "personnelManifest") {
        const arr = Array.isArray(v) ? v : [];
        v = JSON.stringify(
          arr
            .filter((p) => p && typeof p === "object")
            .map((p) => {
              const rawMode = String((p as Record<string, unknown>).travel_mode ?? "on_vehicle").toLowerCase();
              const travelMode =
                rawMode === "straggler_public_transport" ? "straggler_public_transport" : "on_vehicle";
              const notesRaw = (p as Record<string, unknown>).notes;
              const notes =
                typeof notesRaw === "string" ? notesRaw.trim().slice(0, 200) : "";
              return {
                employee_id: String((p as Record<string, unknown>).employee_id || ""),
                name: String((p as Record<string, unknown>).name || ""),
                department: (p as Record<string, unknown>).department ?? null,
                country: (p as Record<string, unknown>).country ?? null,
                travel_mode: travelMode,
                ...(notes ? { notes } : {}),
              };
            })
        );
      }
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }

  if (fields.length === 0) {
    if (!stopPlanChanged) {
      return NextResponse.json({ error: "No updatable fields supplied." }, { status: 400 });
    }
  }

  const nextTripShape = rollout
    ? normalizeTripShape(body.tripShape ?? row.trip_shape)
    : normalizeTripShape(row.trip_shape);
  const nextDestination = String(body.destination ?? row.destination ?? "").trim();
  const nextStops = incomingStops ?? existingStopShape;
  const routeValidationError = validateRoutePlan({
    tripShape: nextTripShape,
    destination: nextDestination,
    stops: nextStops,
  });
  if (routeValidationError) {
    return NextResponse.json({ error: routeValidationError }, { status: 400 });
  }

  if (wasApproved && (material || stopPlanChanged)) {
    fields.push("approval_status = ?", "approved_at = NULL", "approved_by_id = ?", "approved_by_name = ?");
    values.push("pending", "", "");
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  const tx = db.transaction(() => {
    if (fields.length > 0) {
      db.prepare(`UPDATE missions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }
    if (incomingStops !== null) {
      db.prepare("DELETE FROM mission_stops WHERE mission_id = ?").run(id);
      if (incomingStops.length > 0) {
        const insStop = db.prepare(`
          INSERT INTO mission_stops (
            id, mission_id, stop_order, location, load_out, load_in, notes, created_at, updated_at
          ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let i = 0; i < incomingStops.length; i += 1) {
          const stop = incomingStops[i];
          insStop.run(
            id,
            i + 1,
            stop.location,
            stop.loadOut,
            stop.loadIn,
            stop.notes,
            now,
            now
          );
        }
      }
    }
  });
  tx();

  if (wasApproved && (material || stopPlanChanged)) {
    recordMutation(db, {
      entityType: "mission",
      entityId: id,
      organizationId: orgId,
      action: "mission_reopened_approval",
      actor: actorFrom(user),
      after: { materialFields: true, stopPlanChanged },
    });
  }

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
  const updatedStops = getMissionStops(db, id);
  recordMutation(db, {
    entityType: "mission",
    entityId: id,
    organizationId: orgId,
    action: "update",
    actor: actorFrom(user),
    before: missionAuditSubset(row),
    after: { ...missionAuditSubset(updated), stop_count: updatedStops.length },
  });

  return NextResponse.json({ ...updated, stops: updatedStops, stop_count: updatedStops.length });
}
