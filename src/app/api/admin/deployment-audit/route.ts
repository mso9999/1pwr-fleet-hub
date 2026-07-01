import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";

/**
 * GET /api/admin/deployment-audit?org=1pwr_lesotho
 *
 * One-time / on-demand audit of pre-policy data hygiene. After the
 * 2026-07-01 approved-mission policy gate shipped (commit 23d0e3c),
 * no new departing DVC can be created without an approved-mission
 * trip, and no trip can be Started without an approved mission. This
 * endpoint surfaces the leftover pre-policy rows so dispatch / admin
 * can decide which to close out vs. retroactively attach a mission.
 *
 * Returns four lists:
 *   - orphanTrips:           trips with mission_id IS NULL
 *   - tripsLinkedToUnapproved: trips whose mission approval_status != 'approved'
 *                              (or mission row missing)
 *   - orphanDepartingDvcs:   departing DVCs with trip_id IS NULL
 *   - dvcsLinkedToOrphanTrip: DVCs whose trip_id points to a trip with
 *                              mission_id IS NULL (or trip row missing)
 *
 * Fleet-management roles only (fleet_lead / manager / admin / superadmin).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFleetManagementRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const org = (request.nextUrl.searchParams.get("org") || "1pwr_lesotho").trim();
    const db = getDb();

    const orphanTrips = db
      .prepare(
        `SELECT t.id, t.vehicle_id, v.code AS vehicle_code,
                t.driver_name, t.departure_location, t.destination,
                t.checkout_at, t.departed_at, t.checkin_at, t.source
           FROM trips t
           LEFT JOIN vehicles v ON t.vehicle_id = v.id
          WHERE t.organization_id = ? AND t.mission_id IS NULL
          ORDER BY t.checkout_at DESC LIMIT 200`
      )
      .all(org) as Array<Record<string, unknown>>;

    const tripsLinkedToUnapproved = db
      .prepare(
        `SELECT t.id, t.vehicle_id, v.code AS vehicle_code,
                t.mission_id, m.title AS mission_title,
                m.approval_status AS mission_approval_status,
                m.lifecycle_status AS mission_lifecycle_status,
                t.departed_at, t.checkin_at
           FROM trips t
           LEFT JOIN missions m ON t.mission_id = m.id
           LEFT JOIN vehicles v ON t.vehicle_id = v.id
          WHERE t.organization_id = ?
            AND t.mission_id IS NOT NULL
            AND (
              m.id IS NULL
              OR lower(m.approval_status) != 'approved'
              OR lower(coalesce(m.lifecycle_status, 'active')) != 'active'
            )
          ORDER BY t.checkout_at DESC LIMIT 200`
      )
      .all(org) as Array<Record<string, unknown>>;

    const orphanDepartingDvcs = db
      .prepare(
        `SELECT dvc.id, dvc.vehicle_id, v.code AS vehicle_code,
                dvc.driver_name, dvc.check_date, dvc.route_from, dvc.route_to,
                dvc.trip_id, substr(dvc.passenger_manifest, 1, 200) AS manifest_excerpt,
                dvc.created_at
           FROM driver_vehicle_checks dvc
           LEFT JOIN vehicles v ON dvc.vehicle_id = v.id
          WHERE dvc.organization_id = ?
            AND dvc.direction = 'departing'
            AND dvc.trip_id IS NULL
          ORDER BY dvc.created_at DESC LIMIT 200`
      )
      .all(org) as Array<Record<string, unknown>>;

    const dvcsLinkedToOrphanTrip = db
      .prepare(
        `SELECT dvc.id, dvc.vehicle_id, v.code AS vehicle_code,
                dvc.driver_name, dvc.check_date, dvc.trip_id,
                t.mission_id, t.departed_at, t.checkin_at
           FROM driver_vehicle_checks dvc
           LEFT JOIN vehicles v ON dvc.vehicle_id = v.id
           LEFT JOIN trips t ON dvc.trip_id = t.id
          WHERE dvc.organization_id = ?
            AND dvc.direction = 'departing'
            AND dvc.trip_id IS NOT NULL
            AND (t.id IS NULL OR t.mission_id IS NULL)
          ORDER BY dvc.created_at DESC LIMIT 200`
      )
      .all(org) as Array<Record<string, unknown>>;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      organizationId: org,
      counts: {
        orphanTrips: orphanTrips.length,
        tripsLinkedToUnapproved: tripsLinkedToUnapproved.length,
        orphanDepartingDvcs: orphanDepartingDvcs.length,
        dvcsLinkedToOrphanTrip: dvcsLinkedToOrphanTrip.length,
      },
      orphanTrips,
      tripsLinkedToUnapproved,
      orphanDepartingDvcs,
      dvcsLinkedToOrphanTrip,
    });
  } catch (err) {
    console.error("[admin/deployment-audit] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
