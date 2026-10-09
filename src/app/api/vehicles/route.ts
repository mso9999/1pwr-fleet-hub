import { NextRequest, NextResponse } from "next/server";
import { resolveVehicleSite } from "@/lib/org-hq-site";
import { defaultCurrencyForOrg } from "@/lib/org-currency";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { pushVehicleRowToPr as pushVehicleToPr } from "@/lib/pr-vehicle-sync";
import { vehicleVisibleToOrgSql } from "@/lib/vehicle-org-scope";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const assetClass = searchParams.get("assetClass");
  const pool = searchParams.get("pool");
  const currentLocation = searchParams.get("currentLocation");
  const homeLocation = searchParams.get("homeLocation");

  const org = searchParams.get("org") || "1pwr_lesotho";

  // Owned + seconded-in vehicles. owner_country / seconded_to_country feed the
  // "Seconded from LS" / "Seconded to ZM" badges.
  const scope = vehicleVisibleToOrgSql(org, "v");
  let query = `SELECT v.*, oo.country AS owner_country, so.country AS seconded_to_country
    FROM vehicles v
    LEFT JOIN organizations oo ON oo.id = v.organization_id
    LEFT JOIN organizations so ON so.id = v.seconded_to_org
    WHERE ${scope.sql} AND COALESCE(v.is_synthetic, 0) = 0`;
  const params: string[] = [...scope.params];

  if (status) {
    query += " AND v.status = ?";
    params.push(status);
  }
  if (assetClass) {
    query += " AND v.asset_class = ?";
    params.push(assetClass);
  }
  if (pool) {
    query += " AND v.pool = ?";
    params.push(pool);
  }
  if (currentLocation) {
    query += " AND v.current_location = ?";
    params.push(currentLocation);
  }
  if (homeLocation) {
    query += " AND v.home_location = ?";
    params.push(homeLocation);
  }

  query += " ORDER BY v.code ASC";

  const vehicles = db.prepare(query).all(...params);
  return NextResponse.json(vehicles);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const user = await getVerifiedFleetUser(request);
  const createdById = user?.id ?? "";
  const createdByName = user ? user.name || user.email : "";
  const requestedOrg = String(body.organizationId || "").trim().toLowerCase();
  const actorOrg = String(user?.organizationId || "").trim().toLowerCase();
  const targetOrg = requestedOrg || actorOrg || "1pwr_lesotho";

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
    targetOrg,
    body.code,
    body.make || "",
    body.model || "",
    body.year || null,
    body.licensePlate || "",
    body.vin || "",
    body.engineNumber || "",
    body.assetClass || "4wd",
    resolveVehicleSite(db, targetOrg, body.homeLocation),
    resolveVehicleSite(db, targetOrg, body.currentLocation || body.homeLocation),
    body.status || "operational",
    body.photoUrl || "",
    body.dateInService || "",
    body.notes || "",
    body.purchasePrice || 0,
    body.purchaseDate || "",
    body.purchaseCurrency || defaultCurrencyForOrg(db, targetOrg),
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
      organizationId: String(vehicle.organization_id ?? targetOrg),
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
