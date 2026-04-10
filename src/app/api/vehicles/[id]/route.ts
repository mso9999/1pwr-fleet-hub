import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
  };

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  if (body.status && body.status !== existing.status) {
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("vehicle", id, existing.status, body.status, body.changedBy || "", now);
  }

  db.prepare(`UPDATE vehicles SET ${fields.join(", ")} WHERE id = ?`).run(...values);
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
