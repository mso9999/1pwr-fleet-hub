import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import {
  VEHICLE_STATUS,
  VEHICLE_STATUSES_REQUIRING_OPEN_WO,
  VEHICLE_STATUSES_REQUIRING_SIGNOFF,
  type VehicleStatus,
} from "@/types";
import { canSignOffVehicleStatus } from "@/lib/fleet-roles";
import { v4 as uuidv4 } from "uuid";

/** WO statuses that count as "open" for vehicle-status enforcement. */
const OPEN_WO_STATUSES = ["submitted", "queued", "in-progress", "awaiting-parts"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(vehicle);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();
  const user = await getVerifiedFleetUser(request);

  const existing = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];

  const allowedFields: Record<string, string> = {
    code: "code",
    make: "make",
    model: "model",
    year: "year",
    licensePlate: "license_plate",
    vin: "vin",
    engineNumber: "engine_number",
    assetClass: "asset_class",
    homeLocation: "home_location",
    currentLocation: "current_location",
    status: "status",
    photoUrl: "photo_url",
    dateInService: "date_in_service",
    notes: "notes",
    trackerImei: "tracker_imei",
    trackerProvider: "tracker_provider",
    trackerSim: "tracker_sim",
    trackerModel: "tracker_model",
    trackerInstallDate: "tracker_install_date",
    trackerStatus: "tracker_status",
    // Financial / TCO
    purchasePrice: "purchase_price",
    purchaseDate: "purchase_date",
    purchaseCurrency: "purchase_currency",
    residualValue: "residual_value",
    insuranceMonthly: "insurance_monthly",
    // Classification
    fuelType: "fuel_type",
    transmission: "transmission",
    drivetrain: "drivetrain",
    engineCapacityCc: "engine_capacity_cc",
    seatingCapacity: "seating_capacity",
    payloadCapacityKg: "payload_capacity_kg",
    // Lifecycle
    totalMileageKm: "total_mileage_km",
    expectedServiceLifeKm: "expected_service_life_km",
    expectedServiceLifeYears: "expected_service_life_years",
    eolScore: "eol_score",
    eolStatus: "eol_status",
    // Maintenance intervals
    serviceIntervalKm: "service_interval_km",
    serviceIntervalMonths: "service_interval_months",
    lastServiceDate: "last_service_date",
    lastServiceKm: "last_service_km",
    nextServiceDueDate: "next_service_due_date",
    nextServiceDueKm: "next_service_due_km",
    // Pool
    pool: "pool",
    assignedTeam: "assigned_team",
    fuelConsumptionLPer100km: "fuel_consumption_l_per_100km",
    fuelConsumptionSource: "fuel_consumption_source",
  };

  // Enforce status preconditions before staging the column update.
  let signoffRow: {
    id: string;
    approverId: string;
    approverName: string;
    approverRole: string;
    approverDepartment: string;
    reason: string;
  } | null = null;
  let statusReason = "";

  if (body.status && body.status !== existing.status) {
    const nextStatus = String(body.status) as VehicleStatus;

    // Open-WO requirement.
    if (VEHICLE_STATUSES_REQUIRING_OPEN_WO.includes(nextStatus)) {
      const openWo = db
        .prepare(
          `SELECT COUNT(*) AS c FROM work_orders
           WHERE vehicle_id = ?
             AND status IN (${OPEN_WO_STATUSES.map(() => "?").join(", ")})`
        )
        .get(id, ...OPEN_WO_STATUSES) as { c: number } | undefined;
      if (!openWo || openWo.c === 0) {
        return NextResponse.json(
          {
            error:
              "This vehicle status requires at least one open work order specifying the parts and assignee. Create a work order first, or set the status to diagnosis while the issue is being investigated.",
            reason: "needs_open_work_order",
            attemptedStatus: nextStatus,
            suggestedStatus: VEHICLE_STATUS.DIAGNOSIS,
          },
          { status: 409 }
        );
      }
    }

    // Management sign-off.
    if (VEHICLE_STATUSES_REQUIRING_SIGNOFF.includes(nextStatus)) {
      if (!user) {
        return NextResponse.json(
          {
            error: "Sign in to record this status change.",
            reason: "auth_required",
          },
          { status: 401 }
        );
      }
      if (!canSignOffVehicleStatus(user.role || "")) {
        return NextResponse.json(
          {
            error:
              "Marking a vehicle written-off requires management sign-off (admin / fleet management / executive / finance / superadmin).",
            reason: "requires_management_signoff",
            attemptedStatus: nextStatus,
          },
          { status: 403 }
        );
      }
      const reasonInput = String(body.signoffReason ?? body.reason ?? "").trim();
      if (reasonInput.length < 8) {
        return NextResponse.json(
          {
            error:
              "Provide a written sign-off reason (at least 8 characters) for this status change so it can be audited.",
            reason: "signoff_reason_required",
            attemptedStatus: nextStatus,
          },
          { status: 400 }
        );
      }
      signoffRow = {
        id: uuidv4(),
        approverId: user.id,
        approverName: user.name || user.email,
        approverRole: user.role || "",
        approverDepartment: user.department || "",
        reason: reasonInput,
      };
      statusReason = reasonInput;
    } else if (typeof body.reason === "string" && body.reason.trim().length > 0) {
      // Optional free-text reason for non-signoff status changes (used by backfill / overrides).
      statusReason = String(body.reason).trim();
    }
  }

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (user) {
    fields.push("updated_by_id = ?", "updated_by_name = ?");
    values.push(user.id, user.name || user.email);
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  const statusActor = user?.name || user?.email || String(body.changedBy || "");

  if (body.status && body.status !== existing.status) {
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("vehicle", id, existing.status, body.status, statusActor, now, statusReason);

    if (signoffRow) {
      db.prepare(
        `INSERT INTO vehicle_status_signoffs
           (id, vehicle_id, organization_id, old_status, new_status,
            approver_id, approver_name, approver_role, approver_department, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        signoffRow.id,
        id,
        String(existing.organization_id ?? ""),
        String(existing.status ?? ""),
        String(body.status),
        signoffRow.approverId,
        signoffRow.approverName,
        signoffRow.approverRole,
        signoffRow.approverDepartment,
        signoffRow.reason
      );
    }
  }

  db.prepare(`UPDATE vehicles SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (body.fuelConsumptionLPer100km !== undefined || body.fuelConsumptionSource !== undefined) {
    const rows = db
      .prepare("SELECT id FROM vehicle_requests WHERE assigned_vehicle_id = ?")
      .all(id) as { id: string }[];
    for (const r of rows) {
      await recalculateVehicleRequestFuel(db, r.id);
    }
  }

  const updated = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare("DELETE FROM vehicles WHERE id = ?").run(id);
  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
