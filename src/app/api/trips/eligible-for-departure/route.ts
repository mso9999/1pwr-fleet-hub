import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/trips/eligible-for-departure?vehicleId=X&org=Y
 *
 * Returns trips that are eligible to anchor a departing driver-vehicle-check:
 * - trip.vehicle_id = vehicleId
 * - trip.mission_id IS NOT NULL
 * - linked mission.approval_status = 'approved'
 * - linked mission.lifecycle_status = 'active'
 * - trip.checkin_at IS NULL (not yet returned)
 * - trip.departed_at IS NULL (not yet departed — once departed, the DVC is no
 *   longer the anchor; HR's /api/deployments/current derives status=active
 *   from departed_at, so the DVC must be created BEFORE Start trip)
 *
 * Ordered by planned_departure_date DESC then checkout_at DESC so the most
 * recently planned trip surfaces first. This is the list the DVC form shows
 * in its "Mission / Trip" picker for departing direction.
 *
 * Policy: vehicles must not be deployed without the mission getting logged
 * and approved. This endpoint is the picker's source of truth — if it
 * returns an empty list, the DVC form blocks submit and tells the driver
 * to ask dispatch to log and approve a mission.
 */
export function GET(request: NextRequest): NextResponse {
  try {
    const sp = request.nextUrl.searchParams;
    const vehicleId = (sp.get("vehicleId") || "").trim();
    const org = (sp.get("org") || "1pwr_lesotho").trim();

    if (!vehicleId) {
      return NextResponse.json(
        { error: "vehicleId is required", trips: [] },
        { status: 400 }
      );
    }

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT
            t.id, t.organization_id, t.vehicle_id, t.mission_id,
            t.driver_name, t.departure_location, t.destination,
            t.checkout_at, t.planned_departure_date, t.departed_at, t.checkin_at,
            t.mission_type, t.trip_shape,
            m.title            AS mission_title,
            m.approval_status  AS mission_approval_status,
            m.lifecycle_status AS mission_lifecycle_status,
            m.departure_date   AS mission_departure_date,
            m.return_date      AS mission_return_date,
            v.code             AS vehicle_code,
            v.make             AS vehicle_make,
            v.model            AS vehicle_model
         FROM trips t
         JOIN missions m ON t.mission_id = m.id
         LEFT JOIN vehicles v ON t.vehicle_id = v.id
         WHERE t.organization_id = ?
           AND t.vehicle_id = ?
           AND t.mission_id IS NOT NULL
           AND lower(m.approval_status) = 'approved'
           AND lower(coalesce(m.lifecycle_status, 'active')) = 'active'
           AND t.checkin_at IS NULL
           AND t.departed_at IS NULL
         ORDER BY
            CASE WHEN t.planned_departure_date IS NULL THEN 1 ELSE 0 END,
            t.planned_departure_date DESC,
            t.checkout_at DESC
         LIMIT 50`
      )
      .all(org, vehicleId) as Array<Record<string, unknown>>;

    return NextResponse.json({ trips: rows });
  } catch (err) {
    console.error("[trips/eligible-for-departure] GET error:", err);
    return NextResponse.json(
      { error: String(err), trips: [] },
      { status: 500 }
    );
  }
}
