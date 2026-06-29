import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeHrApiRequest } from "@/lib/hr-api-auth";
import { inspectionUrl } from "@/lib/deployments";

/**
 * GET /api/deployments/inspection/{inspection_id}
 *
 * Returns a single driver-vehicle-check (pre-departure inspection) record for
 * HR consumption, in a redacted, HR-safe shape: biographic + operational
 * fields only, no failure-photo URLs or internal user ids. This is the record
 * an HR approver reaches from the `inspection_url` deep link on a timecard.
 *
 * Auth: X-API-Key: <FLEET_HR_API_KEY> (optionally IP-allow-listed).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = authorizeHrApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT dvc.id, dvc.organization_id, dvc.vehicle_id, dvc.driver_name,
              dvc.check_date, dvc.created_at, dvc.updated_at, dvc.direction,
              dvc.route_from, dvc.route_to, dvc.mileage_km,
              dvc.overall_pass, dvc.has_exceptions, dvc.exception_approved,
              dvc.passenger_manifest, dvc.travel_phone_number, dvc.remarks,
              v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
              v.license_plate,
              t.id as trip_id, t.departed_at, t.checkin_at, t.checkout_at,
              t.destination, t.departure_location
       FROM driver_vehicle_checks dvc
       JOIN vehicles v ON dvc.vehicle_id = v.id
       LEFT JOIN trips t ON dvc.trip_id = t.id
       WHERE dvc.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  let manifest: unknown = [];
  try {
    manifest = typeof row.passenger_manifest === "string" ? JSON.parse(row.passenger_manifest) : [];
  } catch {
    manifest = [];
  }

  const response = {
    inspection_id: String(row.id),
    organization_id: String(row.organization_id),
    check_date: String(row.check_date ?? ""),
    created_at: String(row.created_at ?? ""),
    direction: String(row.direction ?? ""),
    route_from: String(row.route_from ?? ""),
    route_to: String(row.route_to ?? ""),
    mileage_km: row.mileage_km ?? null,
    overall_pass: row.overall_pass === 1,
    has_exceptions: row.has_exceptions === 1,
    exception_approved: row.exception_approved === 1,
    driver_name: String(row.driver_name ?? ""),
    travel_phone_number: String(row.travel_phone_number ?? ""),
    remarks: String(row.remarks ?? ""),
    passenger_manifest: manifest,
    vehicle: row.vehicle_code
      ? {
          code: String(row.vehicle_code),
          make: String(row.vehicle_make ?? ""),
          model: String(row.vehicle_model ?? ""),
          registration: row.license_plate ? String(row.license_plate) : null,
        }
      : null,
    trip: row.trip_id
      ? {
          id: String(row.trip_id),
          checkout_at: row.checkout_at ?? null,
          departed_at: row.departed_at ?? null,
          checkin_at: row.checkin_at ?? null,
          departure_location: row.departure_location ?? null,
          destination: row.destination ?? null,
        }
      : null,
    inspection_url: inspectionUrl(String(row.id)),
  };

  return NextResponse.json(response);
}
