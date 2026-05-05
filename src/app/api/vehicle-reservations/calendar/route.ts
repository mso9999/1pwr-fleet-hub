import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { dateRangesOverlap } from "@/lib/mission-reservations";

/**
 * GET /api/vehicle-reservations/calendar?org=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Active reservations overlapping the window (prevents double-booking visibility).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const from = String(sp.get("from") || "").slice(0, 10);
  const to = String(sp.get("to") || "").slice(0, 10);
  if (!from || !to || from.length !== 10 || to.length !== 10) {
    return NextResponse.json({ error: "from and to query params (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT
      vr.id as reservation_id,
      vr.vehicle_id,
      vr.mission_id,
      vr.start_date,
      vr.end_date,
      vr.status as reservation_status,
      v.code as vehicle_code,
      m.title as mission_title,
      m.destination as mission_destination,
      m.departure_date as mission_departure_date,
      m.lifecycle_status,
      m.approval_status
    FROM vehicle_reservations vr
    JOIN vehicles v ON v.id = vr.vehicle_id AND v.organization_id = vr.organization_id
    JOIN missions m ON m.id = vr.mission_id AND m.organization_id = vr.organization_id
    WHERE vr.organization_id = ?
      AND vr.status = 'active'
  `
    )
    .all(org) as Array<{
    reservation_id: string;
    vehicle_id: string;
    mission_id: string;
    start_date: string;
    end_date: string;
    reservation_status: string;
    vehicle_code: string;
    mission_title: string;
    mission_destination: string;
    mission_departure_date: string;
    lifecycle_status: string;
    approval_status: string;
  }>;

  const inWindow = rows.filter((r) => dateRangesOverlap(r.start_date, r.end_date, from, to));

  return NextResponse.json({
    organizationId: org,
    from,
    to,
    reservations: inWindow,
  });
}
