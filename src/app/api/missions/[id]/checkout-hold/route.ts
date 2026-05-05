import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicle } from "@/lib/vehicle-check-approvers";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { MISSION_LIFECYCLE_CHECKOUT_HOLD } from "@/lib/mission-checkout";

/**
 * POST /api/missions/[id]/checkout-hold
 * Fleet lead: mission cannot proceed to trip (e.g. reserved vehicle not operational, no spare operational unit).
 * Sets lifecycle to checkout_hold and notifies management via dashboard alerts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAllocateFleetVehicle(user.role)) {
    return NextResponse.json(
      { error: "Only fleet team lead (or superadmin) may place a mission on checkout hold." },
      { status: 403 }
    );
  }

  const { id: missionId } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String((body as { reason?: string }).reason || "").trim();
  if (reason.length < 8) {
    return NextResponse.json(
      { error: "Provide a reason (at least 8 characters) for management." },
      { status: 400 }
    );
  }

  const db = getDb();
  const m = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as Record<string, unknown> | undefined;
  if (!m) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  const orgId = String(m.organization_id ?? "");
  if (String(m.approval_status || "").toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Only approved missions can be put on checkout hold." }, { status: 400 });
  }

  const life = String(m.lifecycle_status || "active").toLowerCase();
  if (life === MISSION_LIFECYCLE_CHECKOUT_HOLD) {
    return NextResponse.json({ error: "Mission is already on checkout hold." }, { status: 400 });
  }

  const tripId = m.trip_id ? String(m.trip_id) : "";
  if (tripId) {
    const t = db.prepare("SELECT checkin_at FROM trips WHERE id = ?").get(tripId) as { checkin_at: string | null } | undefined;
    if (t && !t.checkin_at) {
      return NextResponse.json(
        { error: "Cannot hold: mission already has an active trip." },
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE missions SET lifecycle_status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`
  ).run(MISSION_LIFECYCLE_CHECKOUT_HOLD, reason, now, missionId);

  recordMutation(db, {
    entityType: "mission",
    entityId: missionId,
    organizationId: orgId,
    action: "mission_checkout_hold",
    actor: actorFrom(user),
    after: { reason },
  });

  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId);
  return NextResponse.json(updated);
}
