import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { v4 as uuidv4 } from "uuid";
import {
  MECHANICAL_INSPECTION_TYPES_FOR_TRANSFER,
  isVehicleCountryChangeKind,
} from "@/lib/vehicle-country-change";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await getVerifiedFleetUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: vehicleId } = await params;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, fo.name AS from_org_name, to_org.name AS to_org_name
       FROM vehicle_country_change_requests r
       LEFT JOIN organizations fo ON r.from_organization_id = fo.id
       LEFT JOIN organizations to_org ON r.to_organization_id = to_org.id
       WHERE r.vehicle_id = ?
       ORDER BY r.created_at DESC
       LIMIT 50`
    )
    .all(vehicleId);
  return NextResponse.json(rows);
}

function assertNoPendingRequest(db: ReturnType<typeof getDb>, vehicleId: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM vehicle_country_change_requests
       WHERE vehicle_id = ? AND status IN ('pending_fleet', 'pending_executive')`
    )
    .get(vehicleId) as { id: string } | undefined;
  return row ? "A country change request is already pending for this vehicle." : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: vehicleId } = await params;
  const db = getDb();
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const pendingErr = assertNoPendingRequest(db, vehicleId);
  if (pendingErr) return NextResponse.json({ error: pendingErr }, { status: 409 });

  const body = (await request.json()) as Record<string, unknown>;
  const kind = typeof body.changeKind === "string" ? body.changeKind : "";
  if (!isVehicleCountryChangeKind(kind)) {
    return NextResponse.json(
      { error: "changeKind must be data_correction, secondment, or permanent_transfer" },
      { status: 400 }
    );
  }

  const toOrganizationId = typeof body.toOrganizationId === "string" ? body.toOrganizationId.trim() : "";
  const fromOrganizationId = vehicle.organization_id as string;
  if (!toOrganizationId) {
    return NextResponse.json({ error: "toOrganizationId is required" }, { status: 400 });
  }
  if (toOrganizationId === fromOrganizationId) {
    return NextResponse.json({ error: "Target country must differ from the current assignment" }, { status: 400 });
  }

  const orgExists = db.prepare("SELECT 1 FROM organizations WHERE id = ? AND active = 1").get(toOrganizationId);
  if (!orgExists) {
    return NextResponse.json({ error: "Unknown or inactive organization" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3) {
    return NextResponse.json({ error: "Please explain the change (at least a few characters)" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = uuidv4();

  if (kind === "data_correction") {
    db.prepare(
      `INSERT INTO vehicle_country_change_requests (
        id, vehicle_id, from_organization_id, to_organization_id, change_kind, reason,
        effective_date, expected_return_date, transfer_summary, mission_trip_id, mechanical_inspection_id,
        status, requested_by_id, requested_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', 'pending_fleet', ?, ?, ?, ?)`
    ).run(
      id,
      vehicleId,
      fromOrganizationId,
      toOrganizationId,
      kind,
      reason,
      user.id,
      user.name,
      now,
      now
    );
  } else {
    const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate.trim() : "";
    const expectedReturnDate =
      typeof body.expectedReturnDate === "string" ? body.expectedReturnDate.trim() : "";
    const transferSummary = typeof body.transferSummary === "string" ? body.transferSummary.trim() : "";
    const missionTripId = typeof body.missionTripId === "string" ? body.missionTripId.trim() : "";
    const mechanicalInspectionId =
      typeof body.mechanicalInspectionId === "string" ? body.mechanicalInspectionId.trim() : "";

    if (!effectiveDate) {
      return NextResponse.json({ error: "effectiveDate is required for transfers" }, { status: 400 });
    }
    if (kind === "secondment" && !expectedReturnDate) {
      return NextResponse.json({ error: "expectedReturnDate is required for a secondment" }, { status: 400 });
    }
    if (transferSummary.length < 5) {
      return NextResponse.json(
        { error: "Please provide transfer details (transferSummary, at least a few words)" },
        { status: 400 }
      );
    }
    if (!missionTripId) {
      return NextResponse.json({ error: "missionTripId (trip / mission) is required for transfers" }, { status: 400 });
    }
    if (!mechanicalInspectionId) {
      return NextResponse.json(
        { error: "mechanicalInspectionId is required for transfers" },
        { status: 400 }
      );
    }

    const trip = db.prepare("SELECT id, vehicle_id FROM trips WHERE id = ?").get(missionTripId) as
      | { id: string; vehicle_id: string }
      | undefined;
    if (!trip || trip.vehicle_id !== vehicleId) {
      return NextResponse.json(
        { error: "Mission trip not found or does not belong to this vehicle" },
        { status: 400 }
      );
    }

    const insp = db
      .prepare("SELECT id, vehicle_id, overall_pass, type FROM inspections WHERE id = ?")
      .get(mechanicalInspectionId) as
      | { id: string; vehicle_id: string; overall_pass: number; type: string }
      | undefined;
    if (!insp || insp.vehicle_id !== vehicleId) {
      return NextResponse.json(
        { error: "Mechanical inspection not found or does not belong to this vehicle" },
        { status: 400 }
      );
    }
    if (!insp.overall_pass) {
      return NextResponse.json(
        { error: "Mechanical inspection must be completed with an overall pass" },
        { status: 400 }
      );
    }
    if (!MECHANICAL_INSPECTION_TYPES_FOR_TRANSFER.has(insp.type)) {
      return NextResponse.json(
        {
          error:
            "Inspection must be a completed mechanical checklist (type detailed or mechanical-transfer)",
        },
        { status: 400 }
      );
    }

    db.prepare(
      `INSERT INTO vehicle_country_change_requests (
        id, vehicle_id, from_organization_id, to_organization_id, change_kind, reason,
        effective_date, expected_return_date, transfer_summary, mission_trip_id, mechanical_inspection_id,
        status, requested_by_id, requested_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_executive', ?, ?, ?, ?)`
    ).run(
      id,
      vehicleId,
      fromOrganizationId,
      toOrganizationId,
      kind,
      reason,
      effectiveDate,
      kind === "secondment" ? expectedReturnDate : "",
      transferSummary,
      missionTripId,
      mechanicalInspectionId,
      user.id,
      user.name,
      now,
      now
    );
  }

  const created = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(id);
  return NextResponse.json(created, { status: 201 });
}
