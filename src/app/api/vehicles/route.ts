import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const assetClass = searchParams.get("assetClass");

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

  query += " ORDER BY code ASC";

  const vehicles = db.prepare(query).all(...params);
  return NextResponse.json(vehicles);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();

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
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
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
    body.assetClass || "light-vehicle",
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
    now,
    now
  );

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
  return NextResponse.json(vehicle, { status: 201 });
}
