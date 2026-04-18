import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { insertPlannedMission } from "@/lib/missions";

/**
 * Planned missions (trip shells) — linked from vehicle requests before an operational trip checkout exists.
 */
export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const status = request.nextUrl.searchParams.get("status") ?? "planned";
  const approvalStatus = request.nextUrl.searchParams.get("approvalStatus");

  let sql = `
    SELECT id, organization_id, title, destination, departure_date, return_date, mission_type,
           passengers, loadout_summary, notes, status, trip_id,
           approval_status, approved_by_name, approved_at, rejection_reason,
           created_by_name, created_at, updated_at
    FROM missions
    WHERE organization_id = ?
  `;
  const params: string[] = [org];

  if (status !== "all") {
    sql += " AND status = ?";
    params.push(status);
  }

  if (approvalStatus && approvalStatus !== "all") {
    sql += " AND lower(approval_status) = lower(?)";
    params.push(approvalStatus);
  }

  sql += " ORDER BY departure_date DESC, created_at DESC LIMIT 200";

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
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
  });

  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
