import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isApprovedDriverForCategory } from "@/lib/approved-drivers";
import { DEFAULT_OPERATOR_CATEGORY } from "@/lib/ehs-operator-categories";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import { VR_SELECT_FIELDS, VR_FROM_JOIN } from "@/lib/vehicle-request-queries";
import { canOverridePrerequisite } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { v4 as uuidv4 } from "uuid";
import { ASSET_CLASS } from "@/types";

export function GET(request: NextRequest): NextResponse {
  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;
    const org = sp.get("org") || "1pwr_lesotho";

    let query = `
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.organization_id = ?
  `;
    const params: unknown[] = [org];

    const status = sp.get("status");
    if (status) {
      query += " AND vr.status = ?";
      params.push(status);
    }

    const requestedById = sp.get("requestedById");
    if (requestedById) {
      query += " AND vr.requested_by_id = ?";
      params.push(requestedById);
    }

    const pending = sp.get("pending");
    if (pending === "true") {
      query += " AND vr.status IN ('requested', 'approved')";
    }

    query +=
      " ORDER BY CASE vr.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, vr.created_at DESC LIMIT 200";

    const rows = db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/vehicle-requests GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = String(body.organizationId || "1pwr_lesotho");
  const overrideReasonRaw = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
  const hasOverridePermission = canOverridePrerequisite(db, orgId, user.email, user.role);
  const wantsOverride = overrideReasonRaw.length > 0;
  const overrideUsable = wantsOverride && hasOverridePermission && overrideReasonRaw.length >= 8;
  const bypassedGates: Array<{ id: string; detail: string }> = [];

  if (
    !isApprovedDriverForCategory(db, orgId, user.email, DEFAULT_OPERATOR_CATEGORY) &&
    user.role !== "superadmin"
  ) {
    if (!overrideUsable) {
      return NextResponse.json(
        {
          error: wantsOverride
            ? "Override needs at least 8 characters in the reason field, and you must be an admin or PR-credentialed approver."
            : "Only drivers on the EHS approved drivers register may request a vehicle. Ask EHS or fleet to add you if eligible.",
        },
        { status: 403 },
      );
    }
    bypassedGates.push({
      id: "ehs_approved_driver",
      detail: "Submitter is not on the EHS approved drivers register for this category.",
    });
  }

  const missionId = body.missionId ? String(body.missionId) : "";
  let existingMission: Record<string, unknown> | undefined;

  if (!missionId) {
    if (!overrideUsable) {
      return NextResponse.json(
        {
          error:
            "Link this request to an approved mission (missionId). Create a mission first and wait for management approval if needed.",
        },
        { status: 400 },
      );
    }
    bypassedGates.push({
      id: "approved_mission_required",
      detail: "Submitted without an approved mission link.",
    });
  } else {
    existingMission = db
      .prepare("SELECT * FROM missions WHERE id = ? AND organization_id = ?")
      .get(missionId, orgId) as Record<string, unknown> | undefined;
    if (!existingMission) {
      return NextResponse.json({ error: "Mission not found for this organization." }, { status: 400 });
    }

    const approvalStatus = String(existingMission.approval_status ?? "pending").toLowerCase();
    if (approvalStatus !== "approved") {
      if (!overrideUsable) {
        return NextResponse.json(
          {
            error:
              "This mission is not approved yet. An authorised manager must approve the mission before you can request a vehicle.",
          },
          { status: 400 },
        );
      }
      bypassedGates.push({
        id: "mission_not_approved",
        detail: `Mission ${missionId} approval_status=${approvalStatus} bypassed.`,
      });
    }
  }

  const requiredVehicleClassRaw = String(body.requiredVehicleClass ?? "").trim();
  const assetClassValues = Object.values(ASSET_CLASS) as string[];
  if (!requiredVehicleClassRaw || !assetClassValues.includes(requiredVehicleClassRaw)) {
    if (!overrideUsable) {
      return NextResponse.json(
        {
          error:
            "Choose a required vehicle type (e.g. 4WD SUV / bakkie, cargo truck). Fleet assigns a specific vehicle after approval — do not pick a vehicle code here.",
        },
        { status: 400 }
      );
    }
    bypassedGates.push({
      id: "vehicle_type_required",
      detail: "Submitted without a valid requiredVehicleClass asset code.",
    });
  }

  const destination = String(existingMission?.destination ?? body.destination ?? "");
  const departureDate = String(existingMission?.departure_date ?? body.departureDate ?? "");
  const returnDate = String(existingMission?.return_date ?? body.returnDate ?? "");
  const passengersDefault = String(existingMission?.passengers ?? "");
  const loadoutDefault = String(existingMission?.loadout_summary ?? "");

  const requestedById = user.id;
  const requestedByName = user.name || user.email;
  const id = uuidv4();
  const now = new Date().toISOString();
  const rrRaw = String(body.rrStatus ?? "na").toLowerCase();
  const rrStatus = rrRaw === "pending" || rrRaw === "approved" || rrRaw === "na" ? rrRaw : "na";

  db.prepare(`
    INSERT INTO vehicle_requests (
      id, organization_id, mission_id, requested_by_id, requested_by_name, requested_for,
      vehicle_id, purpose, destination, departure_date, return_date,
      passengers, required_vehicle_class, loadout_description,
      priority, status, notes, rr_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)
  `).run(
    id,
    orgId,
    missionId || null,
    requestedById,
    requestedByName,
      body.requestedFor || "",
    null,
    body.purpose || "",
    destination,
    departureDate,
    returnDate,
    body.passengers !== undefined && body.passengers !== "" ? String(body.passengers) : passengersDefault,
    requiredVehicleClassRaw,
    body.loadoutDescription !== undefined && body.loadoutDescription !== ""
      ? String(body.loadoutDescription)
      : loadoutDefault,
    body.priority || "normal",
    body.notes || "",
    rrStatus,
    now,
    now
  );

  await recalculateVehicleRequestFuel(db, id);

  if (overrideUsable && bypassedGates.length > 0) {
    recordMutation(db, {
      entityType: "vehicle_request",
      entityId: id,
      organizationId: orgId,
      action: "prerequisite_override",
      actor: actorFrom(user),
      after: {
        missionId: missionId || null,
        gatesBypassed: bypassedGates,
      },
      reason: overrideReasonRaw,
    });
  }

  const row = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);
  return NextResponse.json(row, { status: 201 });
}
