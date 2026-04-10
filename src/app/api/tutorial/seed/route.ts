import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates a single demo vehicle (code TUT-xxxx) for the interactive tutorial.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const db = getDb();
  const id = uuidv4();
  const code = `TUT-${id.slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT id FROM vehicles WHERE organization_id = ? AND code LIKE 'TUT-%' LIMIT 1").get(organizationId) as
    | { id: string }
    | undefined;
  if (existing) {
    const row = db.prepare("SELECT id, code FROM vehicles WHERE id = ?").get(existing.id) as { id: string; code: string };
    return NextResponse.json({ vehicleId: row.id, code: row.code, alreadyExists: true });
  }

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
    organizationId,
    code,
    "Ford",
    "Ranger (tutorial demo)",
    2019,
    "",
    "",
    "",
    "4wd",
    "HQ",
    "HQ",
    "operational",
    "",
    "",
    "Tutorial demo — removed when tutorial ends.",
    0,
    "",
    "LSL",
    0,
    0,
    "",
    "",
    "",
    0,
    0,
    0,
    0,
    0,
    0,
    10000,
    6,
    "general",
    "",
    now,
    now
  );

  return NextResponse.json({ vehicleId: id, code });
}
