import { NextRequest, NextResponse } from "next/server";
import {
  ensureMissionsRowShape,
  ensureMissionsTableAndVehicleRequestMissionId,
  ensureVehiclesCodeColumn,
  getDb,
} from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { insertPlannedMission } from "@/lib/missions";

export const runtime = "nodejs";

/**
 * Planned missions (trip shells) — linked from vehicle requests before an operational trip checkout exists.
 */
export function GET(request: NextRequest): NextResponse {
  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (e) {
    console.error("[api/missions GET] getDb failed", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const status = request.nextUrl.searchParams.get("status") ?? "planned";
  const approvalStatus = request.nextUrl.searchParams.get("approvalStatus");
  const tripCheckoutEligible = request.nextUrl.searchParams.get("tripCheckoutEligible") === "true";

  let sql = `
    SELECT m.id, m.organization_id, m.title, m.destination, m.departure_date, m.return_date, m.mission_type,
           m.passengers, m.loadout_summary, m.notes, m.status, m.trip_id,
           m.approval_status, m.approved_by_name, m.approved_at, m.rejection_reason,
           m.mission_profile, m.required_vehicle_class, m.assigned_vehicle_id, m.rr_status,
           m.assigned_at, m.assigned_by_name, m.lifecycle_status,
           m.created_by_name, m.created_at, m.updated_at,
           v.code AS assigned_vehicle_code
    FROM missions m
    LEFT JOIN vehicles v ON m.assigned_vehicle_id = v.id
    WHERE m.organization_id = ?
  `;
  const params: string[] = [org];

  if (status !== "all") {
    /** Must qualify: `vehicles` also has `status` — unqualified `status` errors with LEFT JOIN. */
    sql += " AND m.status = ?";
    params.push(status);
  }

  if (approvalStatus && approvalStatus !== "all") {
    sql += " AND lower(m.approval_status) = lower(?)";
    params.push(approvalStatus);
  }

  if (tripCheckoutEligible) {
    sql += ` AND lower(COALESCE(m.approval_status,'')) = 'approved'
             AND lower(COALESCE(m.lifecycle_status,'active')) = 'active'
             AND trim(COALESCE(m.assigned_vehicle_id,'')) != ''
             AND (
               m.trip_id IS NULL
               OR EXISTS (SELECT 1 FROM trips t WHERE t.id = m.trip_id AND t.checkin_at IS NOT NULL)
             )
    `;
  }

  sql += " ORDER BY m.departure_date DESC, m.created_at DESC LIMIT 200";

  /** Re-run DDL alignments if ensurePhase1Schema failed mid-flight on a prior request (common with SQLite). */
  function repairListSchema(): void {
    try {
      ensureMissionsTableAndVehicleRequestMissionId(db);
    } catch (err) {
      console.error("[api/missions GET] ensureMissionsTableAndVehicleRequestMissionId", err);
    }
    try {
      ensureMissionsRowShape(db);
      ensureVehiclesCodeColumn(db);
    } catch (err) {
      console.error("[api/missions GET] ensureMissionsRowShape / ensureVehiclesCodeColumn", err);
    }
  }

  const execList = () => db.prepare(sql).all(...params);

  try {
    const rows = execList();
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[api/missions GET] first attempt", { org, status, approvalStatus, tripCheckoutEligible, err: e });
    /** Schema drift / partial migrations only — fixed queries like `m.status` do not need this. */
    repairListSchema();
    try {
      const rows = execList();
      return NextResponse.json(rows);
    } catch (e2) {
      const message = e2 instanceof Error ? e2.message : String(e2);
      console.error("[api/missions GET] after schema repair", {
        org,
        status,
        approvalStatus,
        tripCheckoutEligible,
        err: e2,
      });
      return NextResponse.json(
        {
          error: "Failed to load missions",
          /** Truncated SQLite/better-sqlite3 message — needed when production hides server logs from the browser. */
          detail: message.slice(0, 400),
        },
        { status: 500 }
      );
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const organizationId = String(body.organizationId || "1pwr_lesotho");
  const db = getDb();

  const id = insertPlannedMission(db, {
    organizationId,
    title: String(body.title || ""),
    destination: String(body.destination || ""),
    departureDate: String(body.departureDate || ""),
    returnDate: String(body.returnDate || ""),
    missionType: String(body.missionType || "other"),
    passengers: String(body.passengers || ""),
    loadoutSummary: String(body.loadoutSummary || ""),
    notes: String(body.notes || ""),
    createdById: user.id,
    createdByName: user.name || user.email,
    missionProfile: String(body.missionProfile || "local"),
    requiredVehicleClass: String(body.requiredVehicleClass || ""),
    rrStatus: String(body.rrStatus || "na"),
  });

  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
