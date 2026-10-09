import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicleForOrg, canArbitrateMissionCapacity } from "@/lib/vehicle-check-approvers";
import { departureDateKey, listOpenShortfalls, openShortfall } from "@/lib/capacity-shortfall";
import { actorFrom, recordMutation } from "@/lib/record-mutation-log";

export const runtime = "nodejs";

const DEFAULT_REASON = "Fleet reported no vehicle left to allocate.";

/**
 * GET /api/missions/capacity-shortfall?org=
 * Open departure days where fleet has said it cannot allocate a vehicle.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const canRead =
    (await canAllocateFleetVehicleForOrg(db, org, user.email, user.role)) ||
    (await canArbitrateMissionCapacity(db, org, user.email, user.role));
  if (!canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ shortfalls: listOpenShortfalls(db, org) });
}

/**
 * POST /api/missions/capacity-shortfall
 * Body: { org?, departureDate, action: "flag" | "clear", reason? }
 * Fleet lead (or superadmin) reports, or withdraws, a vehicle shortage for one departure day.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { org?: string; departureDate?: string; action?: string; reason?: string };
  const org = String(body.org || "1pwr_lesotho");
  if (!(await canAllocateFleetVehicleForOrg(getDb(), org, user.email, user.role))) {
    return NextResponse.json(
      { error: "Only the fleet lead (or an HR vehicle allocator) can report that no vehicle is left to allocate." },
      { status: 403 }
    );
  }
  const date = departureDateKey(body.departureDate);
  if (!date) return NextResponse.json({ error: "Provide a departure date." }, { status: 400 });
  const action = String(body.action || "").toLowerCase();
  const db = getDb();
  const now = new Date().toISOString();
  const existing = openShortfall(db, org, date);

  if (action === "flag") {
    if (existing) return NextResponse.json({ shortfall: existing });
    const reason = String(body.reason || "").trim() || DEFAULT_REASON;
    const id = randomUUID();
    db.prepare(
      `INSERT INTO departure_capacity_shortfalls
         (id, organization_id, departure_date, status, reason, flagged_by_id, flagged_by_name, flagged_at)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`
    ).run(id, org, date, reason, user.id, user.name || user.email, now);
    recordMutation(db, {
      entityType: "organization",
      entityId: org,
      organizationId: org,
      action: "update",
      actor: actorFrom(user),
      reason: "capacity_shortfall_flag",
      after: { departureDate: date, status: "open", reason },
    });
    return NextResponse.json({ shortfall: openShortfall(db, org, date) }, { status: 201 });
  }

  if (action === "clear") {
    if (!existing) return NextResponse.json({ shortfall: null });
    db.prepare(
      `UPDATE departure_capacity_shortfalls
       SET status = 'cleared', cleared_by_id = ?, cleared_by_name = ?, cleared_at = ?
       WHERE id = ? AND status = 'open'`
    ).run(user.id, user.name || user.email, now, existing.id);
    recordMutation(db, {
      entityType: "organization",
      entityId: org,
      organizationId: org,
      action: "update",
      actor: actorFrom(user),
      reason: "capacity_shortfall_clear",
      after: { departureDate: date, status: "cleared" },
    });
    return NextResponse.json({ shortfall: null });
  }

  return NextResponse.json({ error: "Action must be flag or clear." }, { status: 400 });
}
