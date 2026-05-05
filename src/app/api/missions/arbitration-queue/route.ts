import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canArbitrateMissionCapacity } from "@/lib/vehicle-check-approvers";

/**
 * GET /api/missions/arbitration-queue?org=&date=YYYY-MM-DD
 * Approved, active-lifecycle missions departing on that calendar day (management capacity tools).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  if (!canArbitrateMissionCapacity(db, org, user.email, user.role)) {
    return NextResponse.json(
      { error: "Only management (not fleet lead alone) may view the arbitration queue." },
      { status: 403 }
    );
  }

  const rows = db
    .prepare(
      `
    SELECT m.*, v.code as assigned_vehicle_code, v.status as assigned_vehicle_status
    FROM missions m
    LEFT JOIN vehicles v ON m.assigned_vehicle_id = v.id
    WHERE m.organization_id = ?
      AND date(m.departure_date) = date(?)
      AND lower(m.approval_status) = 'approved'
      AND lower(COALESCE(m.lifecycle_status, 'active')) IN ('active', 'deferred', 'capacity_cancelled', 'checkout_hold')
    ORDER BY
      CASE lower(COALESCE(m.lifecycle_status, 'active'))
        WHEN 'checkout_hold' THEN 0
        WHEN 'active' THEN 1
        WHEN 'deferred' THEN 2
        ELSE 3
      END,
      m.required_vehicle_class,
      m.created_at
  `
    )
    .all(org, date) as Record<string, unknown>[];

  return NextResponse.json({ date, missions: rows });
}
