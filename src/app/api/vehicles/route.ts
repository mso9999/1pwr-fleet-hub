import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { syncVehicleToPrFirestore, type FmVehicleRow } from "@/lib/pr-vehicle-sync";
import { v4 as uuidv4 } from "uuid";

function rowToFmVehicle(row: Record<string, unknown>): FmVehicleRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id ?? "1pwr_lesotho"),
    code: String(row.code ?? ""),
    make: row.make != null ? String(row.make) : "",
    model: row.model != null ? String(row.model) : "",
    year: typeof row.year === "number" ? row.year : null,
    license_plate: row.license_plate != null ? String(row.license_plate) : "",
    vin: row.vin != null ? String(row.vin) : "",
    engine_number: row.engine_number != null ? String(row.engine_number) : "",
    status: row.status != null ? String(row.status) : "operational",
    pr_firestore_id: row.pr_firestore_id != null ? String(row.pr_firestore_id) : "",
  };
}

async function pushVehicleToPr(row: Record<string, unknown>, deactivate = false): Promise<void> {
  const result = await syncVehicleToPrFirestore(rowToFmVehicle(row), { deactivate });
  if (!result.success) {
    console.warn("[vehicles] PR Firestore sync failed:", result.error);
  }
}

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const assetClass = searchParams.get("assetClass");
  const pool = searchParams.get("pool");
  const currentLocation = searchParams.get("currentLocation");
  const homeLocation = searchParams.get("homeLocation");

  const org = searchParams.get("org") || "1pwr_lesotho";

  let query = "SELECT * FROM vehicles WHERE organization_id = ?";
  const params: string[] = [org];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (assetClass) {
    query += " AND asset_class = ?";
    params.push(assetClass);
  }
  if (pool) {
    query += " AND pool = ?";
    params.push(pool);
  }
  if (currentLocation) {
    query += " AND current_location = ?";
    params.push(currentLocation);
  }
  if (homeLocation) {
    query += " AND home_location = ?";
    params.push(homeLocation);
  }

  query += " ORDER BY code ASC";

  const vehicles = db.prepare(query).all(...params);
  return NextResponse.json(vehicles);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const user = await getVerifiedFleetUser(request);
  const createdById = user?.id ?? "";
  const createdByName = user ? user.name || user.email : "";

  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO vehicles (
      id, organization_id, code, make, model, year, license_plate, vin, engine_number,
      asset_class, home_location, current_location, status, photo_url, date_in_service, notes,
      purchase_price, purchase_date, purchase_currency, residual_value, insurance_monthly,
      fuel_type, transmission, drivetrain, engine_capacity_cc, seating_capacity, payload_capacity_kg,
      total_mileage_km, expected_service_life_km, expected_service_life_years,
      service_interval_km, service_interval_months, pool, assigned_team,
      created_by_id, created_by_name, updated_by_id, updated_by_name,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    id,
    body.organizationId || "1pwr_lesotho",
    body.code,
    body.make || "",
    body.model || "",
    body.year || null,
    body.licensePlate || "",
    body.vin || "",
    body.engineNumber || "",
    body.assetClass || "4wd",
    body.homeLocation || "HQ",
    body.currentLocation || body.homeLocation || "HQ",
    body.status || "operational",
    body.photoUrl || "",
    body.dateInService || "",
    body.notes || "",
    body.purchasePrice || 0,
    body.purchaseDate || "",
    body.purchaseCurrency || "LSL",
    body.residualValue || 0,
    body.insuranceMonthly || 0,
    body.fuelType || "",
    body.transmission || "",
    body.drivetrain || "",
    body.engineCapacityCc || 0,
    body.seatingCapacity || 0,
    body.payloadCapacityKg || 0,
    body.totalMileageKm || 0,
    body.expectedServiceLifeKm || 0,
    body.expectedServiceLifeYears || 0,
    body.serviceIntervalKm || 10000,
    body.serviceIntervalMonths || 6,
    body.pool || "general",
    body.assignedTeam || "",
    createdById,
    createdByName,
    createdById,
    createdByName,
    now,
    now
  );

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown>;
  if (user) {
    recordMutation(db, {
      entityType: "vehicle",
      entityId: id,
      organizationId: String(vehicle.organization_id ?? body.organizationId ?? "1pwr_lesotho"),
      action: "create",
      actor: actorFrom(user),
      after: {
        code: vehicle.code,
        status: vehicle.status,
        asset_class: vehicle.asset_class,
        home_location: vehicle.home_location,
      },
    });
  }
  await pushVehicleToPr(vehicle);
  return NextResponse.json(vehicle, { status: 201 });
}
