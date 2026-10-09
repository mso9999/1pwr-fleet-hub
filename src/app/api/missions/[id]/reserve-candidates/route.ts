import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canOverrideInspectionGate, canReserveMissionVehicleForOrg } from "@/lib/vehicle-check-approvers";
import {
  FUTURE_MISSION_RESERVABLE_STATUSES,
  isMissionDepartureToday,
} from "@/lib/mission-reservations";
import { localityGateRequired } from "@/lib/locality-gate";
import { vehicleOperableByOrgSql } from "@/lib/vehicle-org-scope";

/**
 * GET /api/missions/[id]/reserve-candidates
 * Vehicles matching mission required_vehicle_class and eligible status for reservation date.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: missionId } = await params;
  const db = getDb();
  const m = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as Record<string, unknown> | undefined;
  if (!m) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orgId = String(m.organization_id ?? "");
  if (!(await canReserveMissionVehicleForOrg(db, orgId, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dep = String(m.departure_date || "").slice(0, 10);
  const reqClass = String(m.required_vehicle_class || "").trim();
  const today = isMissionDepartureToday(dep);
  const allowed = today
    ? new Set(["operational"])
    : FUTURE_MISSION_RESERVABLE_STATUSES;

  const placeholders = [...allowed].map(() => "?").join(", ");
  // Operating scope: seconded-in vehicles are candidates; seconded-out ones are not.
  const scope = vehicleOperableByOrgSql(orgId);
  let sql = `
    SELECT id, code, make, model, asset_class, status, pool, current_location,
           organization_id, seconded_to_org, secondment_expected_return
    FROM vehicles
    WHERE ${scope.sql} AND status IN (${placeholders})
  `;
  const p: unknown[] = [...scope.params, ...allowed];
  if (reqClass) {
    sql += " AND asset_class = ?";
    p.push(reqClass);
  }
  sql += " ORDER BY pool, code";

  const rows = db.prepare(sql).all(...p) as Array<Record<string, unknown>>;
  const destinationCode = String(m.destination || "").trim();
  const candidates = destinationCode
    ? rows.map((r) => {
        const gate = localityGateRequired(db, orgId, String(r.id), destinationCode);
        return {
          ...r,
          localityRequired: gate.required,
          localityDistanceKm: gate.distanceKm,
          mechanicalInspectionOnFile: gate.inspectionOnFile,
          localityReason: gate.reason,
        };
      })
    : rows;
  return NextResponse.json({
    missionDeparture: dep,
    reservationMode: today ? "today_operational_only" : "future_extended_statuses",
    canOverrideInspection: await canOverrideInspectionGate(db, orgId, user),
    candidates,
  });
}
