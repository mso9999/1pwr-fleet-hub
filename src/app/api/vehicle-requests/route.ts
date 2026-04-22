import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isApprovedDriverForCategory } from "@/lib/approved-drivers";
import { DEFAULT_OPERATOR_CATEGORY } from "@/lib/ehs-operator-categories";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import { VR_SELECT_FIELDS, VR_FROM_JOIN } from "@/lib/vehicle-request-queries";
import { v4 as uuidv4 } from "uuid";

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
  if (
    !isApprovedDriverForCategory(db, orgId, user.email, DEFAULT_OPERATOR_CATEGORY) &&
    user.role !== "superadmin"
  ) {
    return NextResponse.json(
      {
        error:
          "Only drivers on the EHS approved drivers register may request a vehicle. Ask EHS or fleet to add you if eligible.",
      },
      { status: 403 }
    );
  }

  const missionId = body.missionId ? String(body.missionId) : "";
  if (!missionId) {
    return NextResponse.json(
      {
        error:
          "Link this request to an approved mission (missionId). Create a mission first and wait for management approval if needed.",
      },
      { status: 400 }
    );
  }

  const existingMission = db
    .prepare("SELECT * FROM missions WHERE id = ? AND organization_id = ?")
    .get(missionId, orgId) as Record<string, unknown> | undefined;
  if (!existingMission) {
    return NextResponse.json({ error: "Mission not found for this organization." }, { status: 400 });
  }

  const approvalStatus = String(existingMission.approval_status ?? "pending").toLowerCase();
  if (approvalStatus !== "approved") {
    return NextResponse.json(
      {
        error:
          "This mission is not approved yet. An authorised manager must approve the mission before you can request a vehicle.",
      },
      { status: 400 }
    );
  }

  const destination = String(existingMission.destination ?? "");
  const departureDate = String(existingMission.departure_date ?? "");
  const returnDate = String(existingMission.return_date ?? "");
  const passengersDefault = String(existingMission.passengers ?? "");
  const loadoutDefault = String(existingMission.loadout_summary ?? "");

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
    missionId,
    requestedById,
    requestedByName,
    body.requestedFor || "",
    body.vehicleId || null,
    body.purpose || "",
    destination,
    departureDate,
    returnDate,
    body.passengers !== undefined && body.passengers !== "" ? String(body.passengers) : passengersDefault,
    body.requiredVehicleClass || "",
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

  const row = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);
  return NextResponse.json(row, { status: 201 });
}
